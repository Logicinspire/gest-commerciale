import os
import re
import hmac
import uuid
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Optional, List, Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from pymongo import ReturnDocument
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

try:
    from backend.clerk_auth import clerk_router, require_user
except ModuleNotFoundError:
    from clerk_auth import clerk_router, require_user

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

app = FastAPI()
api = APIRouter(prefix="/api")
logger = logging.getLogger("crm")

ROME = ZoneInfo("Europe/Rome")
FASI = ["Contatto ricevuto", "Contatto chiamato", "Proposta inviata", "Remind inviati", "Aggiudicato", "Perso"]
ETICHETTE = ["Ha richiesto info", "Interessato", "Già cliente", "Richiama lui", "Fuori target", "Negativo",
             "Non risponde mai", "Valuta", "Aspetto contratto"]
TIPI = ["chiamata", "richiamo", "follow_up", "rinnovo"]
EVENT_FASE = {"proposta_inviata": "Proposta inviata", "remind_inviato": "Remind inviati",
              "remind_inviati": "Remind inviati", "aggiudicato": "Aggiudicato", "perso": "Perso"}

# ---------------- Roles ----------------
ROLES = ["admin", "commerciale", "in_attesa"]
DEFAULT_ROLE = "in_attesa"
RETIRED_ROLES = {}
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


def _clerk_profile(user_id: str) -> dict:
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    r = requests.get(f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
                     headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "emergent-app"})
    r.raise_for_status()
    data = r.json()
    emails = data.get("email_addresses", [])
    is_admin = any(e["email_address"].lower() in admins and (e.get("verification") or {}).get("status") == "verified" for e in emails)
    email = emails[0]["email_address"] if emails else ""
    name = " ".join(x for x in [data.get("first_name"), data.get("last_name")] if x) or email.split("@")[0]
    return {"is_admin": is_admin, "email": email, "name": name}


async def current_member(user: dict = Depends(require_user)) -> dict:
    uid = user["user_id"]
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role"):
        prof = _clerk_profile(uid)
        role = "admin" if prof["is_admin"] else DEFAULT_ROLE
        await db.users.update_one({"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role}})
        member = await db.users.find_one_and_update(
            {"user_id": uid},
            {"$setOnInsert": {"user_id": uid, "role": role, "name": prof["name"], "email": prof["email"], "created_at": now_iso()}},
            upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if member.get("env") != ENV:
        await db.users.update_one({"user_id": uid}, {"$set": {"env": ENV}})
    return {**member, "env": ENV, "role": effective_role(member["role"])}


def require_role(*roles: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        return member
    return check


staff = require_role("admin", "commerciale")
admin_only = require_role("admin")


@app.on_event("startup")
async def startup():
    for old, new in RETIRED_ROLES.items():
        await db.users.update_many({"role": old}, {"$set": {"role": new}})
    await db.persons.create_index("id", unique=True)
    await db.persons.create_index("email_norm")
    await db.persons.create_index("telefono_norm")
    await db.persons.create_index("pipedrive_id")
    await db.persons.create_index([("updated_at", -1)])
    await db.organizations.create_index("id", unique=True)
    await db.deals.create_index("id", unique=True)
    await db.deals.create_index("person_id")
    await db.deals.create_index("pipedrive_id")
    await db.activities.create_index("id", unique=True)
    await db.activities.create_index([("data", 1), ("ora", 1)])
    await db.activities.create_index("person_id")
    await db.notes.create_index("person_id")
    await db.history.create_index("person_id")


# ---------------- Helpers ----------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today():
    return datetime.now(ROME).date()


def new_id():
    return str(uuid.uuid4())


def norm_email(e):
    e = (e or "").strip().lower()
    return e or None


def norm_phone(p):
    d = re.sub(r"\D", "", p or "")
    if d.startswith("0039"):
        d = d[4:]
    elif d.startswith("39") and len(d) > 10:
        d = d[2:]
    return d or None


def fase_status(fase):
    return "won" if fase == "Aggiudicato" else "lost" if fase == "Perso" else "open"


def person_computed(p: dict) -> dict:
    p["full_name"] = " ".join(x for x in [p.get("nome"), p.get("cognome")] if x).strip() or p.get("email") or "Senza nome"
    p["email_norm"] = norm_email(p.get("email"))
    p["telefono_norm"] = norm_phone(p.get("telefono"))
    return p


async def log(text, member=None, kind="log", **refs):
    await db.history.insert_one({"id": new_id(), "kind": kind, "text": text,
                                 "user_name": member["name"] if member else "Sistema",
                                 "created_at": now_iso(), **refs})


async def find_duplicates(email, telefono, exclude_id=None):
    ors = []
    if norm_email(email):
        ors.append({"email_norm": norm_email(email)})
    if norm_phone(telefono):
        ors.append({"telefono_norm": norm_phone(telefono)})
    if not ors:
        return []
    q = {"$or": ors}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.persons.find(q, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "telefono": 1, "owner_id": 1}).to_list(10)


async def attach_refs(items: list):
    pids = list({i["person_id"] for i in items if i.get("person_id")})
    dids = list({i["deal_id"] for i in items if i.get("deal_id")})
    persons = {p["id"]: p for p in await db.persons.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "telefono": 1}).to_list(len(pids) or 1)}
    deals = {d["id"]: d for d in await db.deals.find({"id": {"$in": dids}}, {"_id": 0, "id": 1, "titolo": 1}).to_list(len(dids) or 1)}
    for i in items:
        i["person"] = persons.get(i.get("person_id"))
        i["deal"] = deals.get(i.get("deal_id"))
    return items


def rx(q):
    return {"$regex": re.escape(q.strip()), "$options": "i"}


# ---------------- Models ----------------
class PersonIn(BaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    professione: Optional[str] = None
    primo_contatto: Optional[str] = None
    prodotto_richiesto: Optional[str] = None
    prodotto_id: Optional[str] = None
    tipo_marketing: Optional[str] = None
    citta: Optional[str] = None
    privacy: Optional[str] = None
    etichette: Optional[List[str]] = None
    org_id: Optional[str] = None
    owner_id: Optional[str] = None
    force: Optional[bool] = False


class OrgIn(BaseModel):
    nome: Optional[str] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    owner_id: Optional[str] = None


class DealIn(BaseModel):
    titolo: Optional[str] = None
    valore: Optional[float] = None
    person_id: Optional[str] = None
    org_id: Optional[str] = None
    owner_id: Optional[str] = None
    fase: Optional[str] = None
    motivo_perso: Optional[str] = None
    prodotti: Optional[List[str]] = None


class ActivityIn(BaseModel):
    tipo: Optional[str] = None
    oggetto: Optional[str] = None
    data: Optional[str] = None
    ora: Optional[str] = None
    ora_fine: Optional[str] = None
    note: Optional[str] = None
    done: Optional[bool] = None
    priorita: Optional[str] = None
    person_id: Optional[str] = None
    deal_id: Optional[str] = None
    org_id: Optional[str] = None
    owner_id: Optional[str] = None


class NoteIn(BaseModel):
    content: str
    person_id: Optional[str] = None
    deal_id: Optional[str] = None
    org_id: Optional[str] = None


class RoleIn(BaseModel):
    role: str


class NameIn(BaseModel):
    name: str


class ImportIn(BaseModel):
    rows: List[dict]


# ---------------- Me / users ----------------
@api.get("/")
async def root():
    return {"ok": True}


@api.get("/me")
async def me(member: dict = Depends(current_member)):
    return member


@api.get("/team")
async def team(member: dict = Depends(staff)):
    people = await db.users.find({**IN_ENV, "role": {"$in": ["admin", "commerciale"]}}, {"_id": 0}).to_list(200)
    return [{"user_id": p["user_id"], "name": p.get("name"), "email": p.get("email"), "role": p["role"]} for p in people]


@api.get("/users")
async def list_users(admin: dict = Depends(admin_only)):
    people = await db.users.find(IN_ENV, {"_id": 0}).to_list(1000)
    return {"roles": [r for r in ROLES if RANK[r] <= RANK[admin["role"]]],
            "users": [{**p, "role": effective_role(p.get("role"))} for p in people]}


@api.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin: dict = Depends(admin_only)):
    if body.role not in ROLES or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(status_code=404, detail="Non trovato")
    if (effective_role(target.get("role")) == "admin" and body.role != "admin"
            and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1):
        raise HTTPException(status_code=409, detail="Deve restare almeno un admin")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"user_id": user_id, "role": body.role}


@api.patch("/users/{user_id}/name")
async def set_name(user_id: str, body: NameIn, admin: dict = Depends(admin_only)):
    r = await db.users.update_one({"user_id": user_id, **IN_ENV}, {"$set": {"name": body.name.strip()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Non trovato")
    return {"ok": True}


@api.get("/config")
async def config(member: dict = Depends(staff)):
    return {"contratti_url": os.environ.get("CONTRATTI_URL", ""), "fasi": FASI, "etichette": ETICHETTE, "tipi": TIPI}


@api.get("/admin/integrations")
async def integrations(admin: dict = Depends(admin_only)):
    return {"webhook_secret": os.environ.get("WEBHOOK_SECRET"), "leads_secret": os.environ.get("LEADS_SECRET"),
            "contratti_url": os.environ.get("CONTRATTI_URL")}


# ---------------- Persons ----------------
@api.get("/persons")
async def list_persons(view: str = "all", q: str = "", label: str = "", owner: str = "", page: int = 1,
                       limit: int = 50, sort: str = "updated_at", dir: int = -1, member: dict = Depends(staff)):
    flt: dict = {}
    if view == "da_assegnare":
        flt["da_assegnare"] = True
    elif view == "mine":
        flt["owner_id"] = member["user_id"]
    if owner:
        flt["owner_id"] = owner
    if label:
        flt["etichette"] = label
    if q.strip():
        ors = [{"full_name": rx(q)}, {"email_norm": rx(q.lower())}]
        digits = re.sub(r"\D", "", q)
        if len(digits) >= 4:
            ors.append({"telefono_norm": {"$regex": digits}})
        flt["$or"] = ors
    if sort not in {"updated_at", "created_at", "full_name", "primo_contatto"}:
        sort = "updated_at"
    total = await db.persons.count_documents(flt)
    items = await db.persons.find(flt, {"_id": 0}).sort(sort, -1 if dir < 0 else 1).skip((page - 1) * limit).limit(min(limit, 200)).to_list(200)
    oids = list({p["org_id"] for p in items if p.get("org_id")})
    orgs = {o["id"]: o["nome"] for o in await db.organizations.find({"id": {"$in": oids}}, {"_id": 0, "id": 1, "nome": 1}).to_list(len(oids) or 1)}
    for p in items:
        p["org_nome"] = orgs.get(p.get("org_id"))
    return {"total": total, "items": items}


@api.get("/persons/counts")
async def person_counts(member: dict = Depends(staff)):
    return {"all": await db.persons.count_documents({}),
            "da_assegnare": await db.persons.count_documents({"da_assegnare": True}),
            "mine": await db.persons.count_documents({"owner_id": member["user_id"]}),
            "organizations": await db.organizations.count_documents({})}


@api.get("/persons/check-duplicates")
async def check_dup(email: str = "", telefono: str = "", exclude: str = "", member: dict = Depends(staff)):
    return await find_duplicates(email, telefono, exclude or None)


@api.post("/persons")
async def create_person(body: PersonIn, member: dict = Depends(staff)):
    data = body.model_dump(exclude={"force"}, exclude_none=True)
    if not (data.get("nome") or data.get("cognome") or data.get("email")):
        raise HTTPException(400, "Inserisci almeno nome o email")
    dups = await find_duplicates(data.get("email"), data.get("telefono"))
    if dups and not body.force:
        raise HTTPException(409, detail={"message": "Possibile doppione", "duplicates": dups})
    if member["role"] != "admin" or not data.get("owner_id"):
        data["owner_id"] = member["user_id"]
    doc = person_computed({"id": new_id(), "etichette": [], **data, "da_assegnare": False, "source": "manuale",
                           "created_at": now_iso(), "updated_at": now_iso()})
    await db.persons.insert_one(doc)
    await log("Persona creata", member, kind="created", person_id=doc["id"])
    doc.pop("_id", None)
    return doc


@api.get("/persons/{pid}")
async def get_person(pid: str, member: dict = Depends(staff)):
    p = await db.persons.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Contatto non trovato")
    org = await db.organizations.find_one({"id": p.get("org_id")}, {"_id": 0}) if p.get("org_id") else None
    deals = await db.deals.find({"person_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    acts = await db.activities.find({"person_id": pid}, {"_id": 0}).sort([("data", 1), ("ora", 1)]).to_list(500)
    notes = await db.notes.find({"person_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    hist = await db.history.find({"person_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    await attach_refs(acts)
    by_type, by_user = {}, {}
    for a in acts:
        by_type[a["tipo"]] = by_type.get(a["tipo"], 0) + 1
        by_user[a.get("owner_id")] = by_user.get(a.get("owner_id"), 0) + 1
    last = max([a.get("done_at") or "" for a in acts if a.get("done")] + [n["created_at"] for n in notes] + [p.get("created_at") or ""])
    inactive = (datetime.now(timezone.utc) - datetime.fromisoformat(last)).days if last else 0
    return {"person": p, "org": org, "deals": deals, "activities": acts, "notes": notes, "history": hist,
            "panoramica": {"by_type": by_type, "by_user": by_user, "inactive_days": inactive}}


@api.patch("/persons/{pid}")
async def update_person(pid: str, body: PersonIn, member: dict = Depends(staff)):
    p = await db.persons.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Contatto non trovato")
    data = body.model_dump(exclude={"force"}, exclude_unset=True)
    if "owner_id" in data and member["role"] != "admin":
        data.pop("owner_id")
    if ("email" in data or "telefono" in data) and not body.force:
        dups = await find_duplicates(data.get("email", p.get("email")), data.get("telefono", p.get("telefono")), pid)
        if dups:
            raise HTTPException(409, detail={"message": "Possibile doppione", "duplicates": dups})
    merged = person_computed({**p, **data, "updated_at": now_iso()})
    if data.get("owner_id"):
        merged["da_assegnare"] = False
    await db.persons.replace_one({"id": pid}, merged)
    changed = [k for k in data if p.get(k) != data[k]]
    if changed:
        await log("Modificati: " + ", ".join(changed), member, person_id=pid)
    return merged


@api.delete("/persons/{pid}")
async def delete_person(pid: str, admin: dict = Depends(admin_only)):
    r = await db.persons.delete_one({"id": pid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Contatto non trovato")
    await db.activities.delete_many({"person_id": pid})
    await db.notes.delete_many({"person_id": pid})
    await db.history.delete_many({"person_id": pid})
    await db.deals.update_many({"person_id": pid}, {"$set": {"person_id": None}})
    return {"ok": True}


async def _assign(pid, owner_id, member):
    p = await db.persons.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Contatto non trovato")
    await db.persons.update_one({"id": pid}, {"$set": {"owner_id": owner_id, "da_assegnare": False, "updated_at": now_iso()}})
    await db.deals.update_many({"person_id": pid, "owner_id": None}, {"$set": {"owner_id": owner_id}})
    await db.activities.update_many({"person_id": pid, "owner_id": None}, {"$set": {"owner_id": owner_id}})
    return p


@api.post("/persons/{pid}/take")
async def take_lead(pid: str, member: dict = Depends(staff)):
    p = await db.persons.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Contatto non trovato")
    if not p.get("da_assegnare"):
        raise HTTPException(409, "Lead già preso da un altro commerciale")
    r = await db.persons.update_one({"id": pid, "da_assegnare": True}, {"$set": {"da_assegnare": False}})
    if r.modified_count == 0:
        raise HTTPException(409, "Lead già preso da un altro commerciale")
    await _assign(pid, member["user_id"], member)
    await db.activities.insert_one({"id": new_id(), "tipo": "chiamata", "oggetto": "Chiamata nuovo lead", "data": today().isoformat(),
                                    "ora": None, "done": False, "person_id": pid, "owner_id": member["user_id"], "created_at": now_iso()})
    await log(f"Lead preso da {member['name']}", member, person_id=pid)
    return {"ok": True}


class AssignIn(BaseModel):
    owner_id: str


@api.post("/persons/{pid}/assign")
async def assign_lead(pid: str, body: AssignIn, admin: dict = Depends(admin_only)):
    target = await db.users.find_one({"user_id": body.owner_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Utente non trovato")
    await _assign(pid, body.owner_id, admin)
    await log(f"Assegnato a {target.get('name')} da {admin['name']}", admin, person_id=pid)
    return {"ok": True}


# ---------------- Organizations ----------------
@api.get("/organizations")
async def list_orgs(q: str = "", page: int = 1, limit: int = 50, member: dict = Depends(staff)):
    flt = {"nome": rx(q)} if q.strip() else {}
    total = await db.organizations.count_documents(flt)
    items = await db.organizations.find(flt, {"_id": 0}).sort("nome", 1).skip((page - 1) * limit).limit(limit).to_list(limit)
    for o in items:
        o["persons_count"] = await db.persons.count_documents({"org_id": o["id"]})
    return {"total": total, "items": items}


@api.post("/organizations")
async def create_org(body: OrgIn, member: dict = Depends(staff)):
    if not body.nome:
        raise HTTPException(400, "Nome obbligatorio")
    doc = {"id": new_id(), **body.model_dump(exclude_none=True), "owner_id": body.owner_id or member["user_id"],
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.organizations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/organizations/{oid}")
async def get_org(oid: str, member: dict = Depends(staff)):
    o = await db.organizations.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Organizzazione non trovata")
    persons = await db.persons.find({"org_id": oid}, {"_id": 0}).to_list(500)
    deals = await db.deals.find({"org_id": oid}, {"_id": 0}).to_list(500)
    return {"org": o, "persons": persons, "deals": deals}


@api.patch("/organizations/{oid}")
async def update_org(oid: str, body: OrgIn, member: dict = Depends(staff)):
    data = body.model_dump(exclude_unset=True)
    r = await db.organizations.update_one({"id": oid}, {"$set": {**data, "updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Organizzazione non trovata")
    return await db.organizations.find_one({"id": oid}, {"_id": 0})


@api.delete("/organizations/{oid}")
async def delete_org(oid: str, admin: dict = Depends(admin_only)):
    r = await db.organizations.delete_one({"id": oid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Organizzazione non trovata")
    await db.persons.update_many({"org_id": oid}, {"$set": {"org_id": None}})
    return {"ok": True}


# ---------------- Deals ----------------
@api.get("/deals")
async def list_deals(status: str = "all", fase: str = "", owner: str = "", q: str = "", page: int = 1, limit: int = 50,
                     member: dict = Depends(staff)):
    flt: dict = {}
    if status in {"open", "won", "lost"}:
        flt["status"] = status
    elif status == "closed":
        flt["status"] = {"$in": ["won", "lost"]}
    if fase:
        flt["fase"] = fase
    if owner:
        flt["owner_id"] = owner
    if q.strip():
        flt["titolo"] = rx(q)
    total = await db.deals.count_documents(flt)
    items = await db.deals.find(flt, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(min(limit, 200)).to_list(200)
    await attach_refs(items)
    return {"total": total, "items": items}


@api.get("/deals/pipeline")
async def pipeline(owner: str = "", member: dict = Depends(staff)):
    out = []
    for f in FASI:
        flt = {"fase": f, **({"owner_id": owner} if owner else {})}
        items = await db.deals.find(flt, {"_id": 0}).sort("updated_at", -1).limit(60).to_list(60)
        await attach_refs(items)
        agg = await db.deals.aggregate([{"$match": flt}, {"$group": {"_id": None, "n": {"$sum": 1}, "v": {"$sum": "$valore"}}}]).to_list(1)
        out.append({"fase": f, "count": agg[0]["n"] if agg else 0, "total": agg[0]["v"] if agg else 0, "items": items})
    return out


@api.post("/deals")
async def create_deal(body: DealIn, member: dict = Depends(staff)):
    if not body.titolo:
        raise HTTPException(400, "Titolo obbligatorio")
    fase = body.fase if body.fase in FASI else FASI[0]
    doc = {"id": new_id(), "titolo": body.titolo, "valore": body.valore or 0, "person_id": body.person_id, "org_id": body.org_id,
           "owner_id": body.owner_id or member["user_id"], "fase": fase, "status": fase_status(fase),
           "prodotti": body.prodotti or [], "created_at": now_iso(), "updated_at": now_iso()}
    await db.deals.insert_one(doc)
    if body.person_id:
        await log(f"Affare creato: {body.titolo}", member, kind="deal", person_id=body.person_id, deal_id=doc["id"])
    doc.pop("_id", None)
    return doc


async def _set_fase(deal: dict, fase: str, member=None, extra=None):
    upd = {"fase": fase, "status": fase_status(fase), "updated_at": now_iso(), **(extra or {})}
    if fase in ("Aggiudicato", "Perso"):
        upd["closed_at"] = now_iso()
    await db.deals.update_one({"id": deal["id"]}, {"$set": upd})
    if deal.get("fase") != fase:
        src = "" if member else " (gestionale contratti)"
        await log(f"Fase affare \"{deal['titolo']}\": {deal.get('fase')} → {fase}{src}", member, kind="stage",
                  person_id=deal.get("person_id"), deal_id=deal["id"])


@api.patch("/deals/{did}")
async def update_deal(did: str, body: DealIn, member: dict = Depends(staff)):
    d = await db.deals.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Affare non trovato")
    data = body.model_dump(exclude_unset=True)
    fase = data.pop("fase", None)
    if data:
        await db.deals.update_one({"id": did}, {"$set": {**data, "updated_at": now_iso()}})
    if fase:
        if fase not in FASI:
            raise HTTPException(400, "Fase non valida")
        await _set_fase(d, fase, member)
    return await db.deals.find_one({"id": did}, {"_id": 0})


@api.delete("/deals/{did}")
async def delete_deal(did: str, admin: dict = Depends(admin_only)):
    r = await db.deals.delete_one({"id": did})
    if r.deleted_count == 0:
        raise HTTPException(404, "Affare non trovato")
    await db.activities.update_many({"deal_id": did}, {"$set": {"deal_id": None}})
    return {"ok": True}


# ---------------- Activities ----------------
def period_filter(period: str):
    t = today()
    if period == "oggi":
        return {"data": t.isoformat()}
    if period == "ritardo":
        return {"data": {"$lt": t.isoformat()}, "done": False}
    if period == "domani":
        return {"data": (t + timedelta(days=1)).isoformat()}
    if period == "settimana":
        end = t + timedelta(days=6 - t.weekday())
        return {"data": {"$gte": t.isoformat(), "$lte": end.isoformat()}}
    if period == "prossima":
        start = t + timedelta(days=7 - t.weekday())
        return {"data": {"$gte": start.isoformat(), "$lte": (start + timedelta(days=6)).isoformat()}}
    return {}


@api.get("/activities")
async def list_activities(period: str = "tutte", status: str = "tutte", owner: str = "me", tipo: str = "", day: str = "",
                          page: int = 1, limit: int = 100, member: dict = Depends(staff)):
    flt = period_filter(period) if not day else {"data": day}
    if status == "da_fare":
        flt["done"] = False
    elif status == "fatte":
        flt["done"] = True
    if owner == "me":
        flt["owner_id"] = member["user_id"]
    elif owner and owner != "all":
        flt["owner_id"] = owner
    if tipo:
        flt["tipo"] = tipo
    total = await db.activities.count_documents(flt)
    direction = -1 if period == "tutte" and not day else 1
    items = await db.activities.find(flt, {"_id": 0}).sort([("data", direction), ("ora", direction)]).skip((page - 1) * limit).limit(min(limit, 300)).to_list(300)
    await attach_refs(items)
    return {"total": total, "items": items}


@api.get("/activities/counts")
async def activity_counts(owner: str = "me", member: dict = Depends(staff)):
    own = {"owner_id": member["user_id"]} if owner == "me" else ({"owner_id": owner} if owner and owner != "all" else {})
    out = {}
    for p in ["oggi", "ritardo", "domani", "settimana"]:
        f = {**period_filter(p), **own}
        if p != "ritardo":
            f["done"] = False
        out[p] = await db.activities.count_documents(f)
    return out


@api.post("/activities")
async def create_activity(body: ActivityIn, member: dict = Depends(staff)):
    data = body.model_dump(exclude_none=True)
    if data.get("tipo") not in TIPI:
        raise HTTPException(400, "Tipo attività non valido")
    if not data.get("data"):
        raise HTTPException(400, "Data obbligatoria")
    doc = {"id": new_id(), "done": False, "ora": None, **data, "owner_id": data.get("owner_id") or member["user_id"], "created_at": now_iso()}
    doc["oggetto"] = doc.get("oggetto") or doc["tipo"].replace("_", " ").capitalize()
    if doc["done"]:
        doc["done_at"] = now_iso()
    await db.activities.insert_one(doc)
    if doc.get("person_id"):
        await db.persons.update_one({"id": doc["person_id"]}, {"$set": {"updated_at": now_iso()}})
    doc.pop("_id", None)
    return doc


@api.patch("/activities/{aid}")
async def update_activity(aid: str, body: ActivityIn, member: dict = Depends(staff)):
    a = await db.activities.find_one({"id": aid}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Attività non trovata")
    data = body.model_dump(exclude_unset=True)
    if "tipo" in data and data["tipo"] not in TIPI:
        raise HTTPException(400, "Tipo attività non valido")
    if data.get("done") is True and not a.get("done"):
        data["done_at"] = now_iso()
        if a.get("person_id"):
            await log(f"Attività completata: {a.get('oggetto')}", member, kind="done", person_id=a["person_id"])
    if data.get("done") is False:
        data["done_at"] = None
    await db.activities.update_one({"id": aid}, {"$set": data})
    return await db.activities.find_one({"id": aid}, {"_id": 0})


@api.delete("/activities/{aid}")
async def delete_activity(aid: str, member: dict = Depends(staff)):
    scope = {} if member["role"] == "admin" else {"owner_id": member["user_id"]}
    r = await db.activities.delete_one({"id": aid, **scope})
    if r.deleted_count == 0:
        raise HTTPException(404, "Attività non trovata")
    return {"ok": True}


# ---------------- Notes ----------------
@api.post("/notes")
async def create_note(body: NoteIn, member: dict = Depends(staff)):
    if not body.content.strip():
        raise HTTPException(400, "Nota vuota")
    doc = {"id": new_id(), **body.model_dump(), "author_id": member["user_id"], "author_name": member["name"], "created_at": now_iso()}
    await db.notes.insert_one(doc)
    if body.person_id:
        await db.persons.update_one({"id": body.person_id}, {"$set": {"updated_at": now_iso()}})
    doc.pop("_id", None)
    return doc


@api.delete("/notes/{nid}")
async def delete_note(nid: str, member: dict = Depends(staff)):
    scope = {} if member["role"] == "admin" else {"author_id": member["user_id"]}
    r = await db.notes.delete_one({"id": nid, **scope})
    if r.deleted_count == 0:
        raise HTTPException(404, "Nota non trovata")
    return {"ok": True}


# ---------------- Search ----------------
@api.get("/search")
async def search(q: str, member: dict = Depends(staff)):
    if len(q.strip()) < 2:
        return {"persons": [], "organizations": [], "deals": []}
    ors = [{"full_name": rx(q)}, {"email_norm": rx(q.lower())}]
    digits = re.sub(r"\D", "", q)
    if len(digits) >= 4:
        ors.append({"telefono_norm": {"$regex": digits}})
    return {"persons": await db.persons.find({"$or": ors}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "telefono": 1}).limit(6).to_list(6),
            "organizations": await db.organizations.find({"nome": rx(q)}, {"_id": 0, "id": 1, "nome": 1}).limit(4).to_list(4),
            "deals": await db.deals.find({"titolo": rx(q)}, {"_id": 0, "id": 1, "titolo": 1, "person_id": 1, "fase": 1}).limit(5).to_list(5)}


# ---------------- Webhooks ----------------
def check_secret(request: Request, env_key: str, header: str):
    expected = os.environ.get(env_key, "")
    given = request.headers.get(header) or request.query_params.get("key") or ""
    if not expected or not hmac.compare_digest(given, expected):
        raise HTTPException(401, "Chiave segreta non valida")


EVENT_LOG = {"proposta_creata": "Proposta creata", "proposta_aperta": "Proposta aperta dal cliente",
             "promemoria_modificato": "Promemoria modificato", "proposta_prorogata": "Scadenza proposta prorogata",
             "mail_reinviata": "Mail proposta reinviata", "pagamento_ricevuto": "Pagamento ricevuto",
             "rata_pagata": "Rata pagata", "lms_creato": "Credenziali LMS create e inviate", "lms_reinviato": "Credenziali LMS reinviate",
             "fattura_emessa": "Fattura emessa"}


@api.post("/webhooks/contratti")
async def webhook_contratti(request: Request):
    check_secret(request, "WEBHOOK_SECRET", "X-Webhook-Secret")
    body: dict = await request.json()
    return await apply_contratti_event(body)


async def apply_contratti_event(body: dict):
    ev = str(body.get("event", "")).lower()
    fase = EVENT_FASE.get(ev)
    if not fase:
        if ev not in EVENT_LOG:
            raise HTTPException(400, "Evento non valido")
        deal = None
        if body.get("crm_deal_id"):
            deal = await db.deals.find_one({"id": body["crm_deal_id"]}, {"_id": 0})
        if not deal and body.get("proposta_id"):
            deal = await db.deals.find_one({"proposte": str(body["proposta_id"])}, {"_id": 0})
        pid = (deal or {}).get("person_id") or body.get("crm_person_id")
        text = EVENT_LOG[ev] + (f" · proposta {body['proposta_id']}" if body.get("proposta_id") else "") + (f" — {body['dettaglio']}" if body.get("dettaglio") else "")
        await log(text, None, kind="contratti", person_id=pid, deal_id=(deal or {}).get("id"))
        if pid:
            await db.persons.update_one({"id": pid}, {"$set": {"updated_at": now_iso()}})
        return {"ok": True, "deal_id": (deal or {}).get("id"), "event": ev}
    deal = None
    if body.get("crm_deal_id"):
        deal = await db.deals.find_one({"id": body["crm_deal_id"]}, {"_id": 0})
    if not deal and body.get("proposta_id"):
        deal = await db.deals.find_one({"proposta_id": str(body["proposta_id"])}, {"_id": 0})
    person = None
    if not deal:
        if body.get("crm_person_id"):
            person = await db.persons.find_one({"id": body["crm_person_id"]}, {"_id": 0})
        if not person:
            dups = await find_duplicates(body.get("email"), body.get("telefono"))
            person = dups[0] if dups else None
        if not person:
            person = person_computed({"id": new_id(), "nome": body.get("nome"), "cognome": body.get("cognome"), "email": body.get("email"),
                                      "telefono": body.get("telefono"), "etichette": [], "owner_id": None, "da_assegnare": True,
                                      "source": "contratti", "created_at": now_iso(), "updated_at": now_iso()})
            await db.persons.insert_one(person)
        deal = await db.deals.find_one({"person_id": person["id"], "status": "open"}, {"_id": 0}, sort=[("created_at", -1)])
        if not deal:
            deal = {"id": new_id(), "titolo": body.get("titolo") or "Proposta", "valore": float(body.get("valore") or 0),
                    "person_id": person["id"], "org_id": None, "owner_id": person.get("owner_id"), "fase": FASI[0], "status": "open",
                    "created_at": now_iso(), "updated_at": now_iso()}
            await db.deals.insert_one(deal)
    extra = {k: body[k] for k in ("proposta_url",) if body.get(k)}
    if body.get("proposta_id"):
        extra["proposta_id"] = str(body["proposta_id"])
    if body.get("valore") is not None:
        extra["valore"] = float(body["valore"])
    if body.get("motivo"):
        extra["motivo_perso"] = body["motivo"]
    await _set_fase(deal, fase, None, extra)
    if deal.get("person_id"):
        await db.persons.update_one({"id": deal["person_id"]}, {"$set": {"updated_at": now_iso()}})
    return {"ok": True, "deal_id": deal["id"], "fase": fase}


@api.post("/webhooks/leads")
async def webhook_leads(request: Request):
    check_secret(request, "LEADS_SECRET", "X-Leads-Secret")
    b: dict = await request.json()
    fields = ["nome", "cognome", "email", "telefono", "professione", "prodotto_richiesto", "tipo_marketing", "citta", "privacy"]
    data = {k: str(b[k]).strip() for k in fields if b.get(k) not in (None, "")}
    if not (data.get("email") or data.get("telefono")):
        raise HTTPException(400, "Email o telefono obbligatori")
    data.setdefault("tipo_marketing", b.get("fonte") or "Sito")
    dups = await find_duplicates(data.get("email"), data.get("telefono"))
    if dups:
        existing = await db.persons.find_one({"id": dups[0]["id"]}, {"_id": 0})
        upd = {"updated_at": now_iso()}
        if not existing.get("owner_id"):
            upd["da_assegnare"] = True
        await db.persons.update_one({"id": existing["id"]}, {"$set": upd, "$addToSet": {"etichette": "Ha richiesto info"}})
        pid, owner = existing["id"], existing.get("owner_id")
        await log(f"Nuova richiesta ({data['tipo_marketing']}) per: {data.get('prodotto_richiesto') or '-'} — doppione riconosciuto", None, kind="lead", person_id=pid)
    else:
        doc = person_computed({"id": new_id(), **data, "primo_contatto": today().isoformat(), "etichette": ["Ha richiesto info"],
                               "owner_id": None, "da_assegnare": True, "source": data["tipo_marketing"], "created_at": now_iso(), "updated_at": now_iso()})
        await db.persons.insert_one(doc)
        pid, owner = doc["id"], None
        await log(f"Lead ricevuto da {data['tipo_marketing']}", None, kind="created", person_id=pid)
    await db.deals.insert_one({"id": new_id(), "titolo": data.get("prodotto_richiesto") or "Richiesta informazioni", "valore": 0,
                               "person_id": pid, "org_id": None, "owner_id": owner, "fase": FASI[0], "status": "open",
                               "created_at": now_iso(), "updated_at": now_iso()})
    return {"ok": True, "person_id": pid, "duplicate": bool(dups)}


# ---------------- Import from Pipedrive (CSV rows mapped on the client) ----------------
DATE_FORMATS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%d.%m.%Y", "%m/%d/%Y"]


def parse_dt(v) -> Optional[datetime]:
    v = (v or "").strip()
    if not v:
        return None
    for f in DATE_FORMATS:
        try:
            return datetime.strptime(v[:19], f)
        except ValueError:
            continue
    return None


def map_fase(fase_txt: str, stato_txt: str) -> str:
    s, f = (stato_txt or "").lower(), (fase_txt or "").lower()
    if s in ("won", "vinto", "aggiudicato") or "aggiudic" in f:
        return "Aggiudicato"
    if s in ("lost", "perso") or "pers" in f:
        return "Perso"
    for key, val in [("chiamat", "Contatto chiamato"), ("propost", "Proposta inviata"), ("remind", "Remind inviati")]:
        if key in f:
            return val
    return "Contatto ricevuto"


def map_tipo(t: str, oggetto: str) -> str:
    s = f"{t} {oggetto}".lower()
    if "rinnov" in s:
        return "rinnovo"
    if "follow" in s:
        return "follow_up"
    if "richiam" in s or "task" in s or "promemoria" in s:
        return "richiamo"
    return "chiamata"


def clean(v):
    return v.strip() if isinstance(v, str) and v.strip() else None


class Resolver:
    def __init__(self):
        self.users = None
        self.cache = {}

    async def owner(self, name):
        name = (name or "").strip().lower()
        if not name:
            return None
        if self.users is None:
            self.users = await db.users.find({"role": {"$in": ["admin", "commerciale"]}}, {"_id": 0}).to_list(100)
        for u in self.users:
            if name == (u.get("email") or "").lower() or name in (u.get("name") or "").lower() or (u.get("name") or "~").lower().split()[0] in name:
                return u["user_id"]
        return None

    async def person(self, pd_id=None, name=None, email=None):
        key = ("p", pd_id, name, email)
        if key in self.cache:
            return self.cache[key]
        p = None
        if pd_id:
            p = await db.persons.find_one({"pipedrive_id": str(pd_id)}, {"_id": 0, "id": 1, "owner_id": 1})
        if not p and email:
            p = await db.persons.find_one({"email_norm": norm_email(email)}, {"_id": 0, "id": 1, "owner_id": 1})
        if not p and name:
            p = await db.persons.find_one({"full_name": {"$regex": f"^{re.escape(name.strip())}$", "$options": "i"}}, {"_id": 0, "id": 1, "owner_id": 1})
        self.cache[key] = p
        return p

    async def org(self, pd_id=None, name=None, create=True):
        if not (pd_id or name):
            return None
        o = None
        if pd_id:
            o = await db.organizations.find_one({"pipedrive_id": str(pd_id)}, {"_id": 0, "id": 1})
        if not o and name:
            o = await db.organizations.find_one({"nome": {"$regex": f"^{re.escape(name.strip())}$", "$options": "i"}}, {"_id": 0, "id": 1})
        if not o and name and create:
            o = {"id": new_id(), "nome": name.strip(), "pipedrive_id": str(pd_id) if pd_id else None, "created_at": now_iso(), "updated_at": now_iso()}
            await db.organizations.insert_one(dict(o))
        return o["id"] if o else None

    async def deal(self, pd_id=None, titolo=None, person_id=None):
        d = None
        if pd_id:
            d = await db.deals.find_one({"pipedrive_id": str(pd_id)}, {"_id": 0, "id": 1, "person_id": 1})
        if not d and titolo:
            q = {"titolo": titolo.strip(), **({"person_id": person_id} if person_id else {})}
            d = await db.deals.find_one(q, {"_id": 0, "id": 1, "person_id": 1})
        return d


def iso_or_now(v):
    d = parse_dt(v)
    return d.replace(tzinfo=ROME).astimezone(timezone.utc).isoformat() if d else now_iso()


@api.post("/import/{kind}")
async def import_rows(kind: str, body: ImportIn, admin: dict = Depends(admin_only)):
    R = Resolver()
    stats = {"creati": 0, "aggiornati": 0, "saltati": 0}
    for raw in body.rows:
        r = {k: clean(v) for k, v in raw.items()}
        try:
            if kind == "organizations":
                if not r.get("nome"):
                    stats["saltati"] += 1
                    continue
                oid = await R.org(r.get("pipedrive_id"), None, create=False) if r.get("pipedrive_id") else None
                data = {k: r.get(k) for k in ("nome", "indirizzo", "citta", "telefono", "email") if r.get(k)}
                data["owner_id"] = await R.owner(r.get("owner"))
                if oid:
                    await db.organizations.update_one({"id": oid}, {"$set": data})
                    stats["aggiornati"] += 1
                else:
                    await db.organizations.insert_one({"id": new_id(), **data, "pipedrive_id": r.get("pipedrive_id"),
                                                       "created_at": iso_or_now(r.get("created_at")), "updated_at": now_iso()})
                    stats["creati"] += 1
            elif kind == "persons":
                nome, cognome = r.get("nome"), r.get("cognome")
                if r.get("full_name") and not (nome or cognome):
                    parts = r["full_name"].split(" ", 1)
                    nome, cognome = parts[0], parts[1] if len(parts) > 1 else None
                if not (nome or cognome or r.get("email")):
                    stats["saltati"] += 1
                    continue
                data = {k: r.get(k) for k in ("email", "telefono", "professione", "prodotto_richiesto", "tipo_marketing", "citta", "privacy") if r.get(k)}
                data.update({"nome": nome, "cognome": cognome})
                pc = parse_dt(r.get("primo_contatto"))
                if pc:
                    data["primo_contatto"] = pc.date().isoformat()
                if r.get("etichette"):
                    labels = [x.strip() for x in r["etichette"].split(",") if x.strip()]
                    data["etichette"] = [next((e for e in ETICHETTE if e.lower() == lbl.lower()), lbl) for lbl in labels]
                org_id = await R.org(r.get("org_pipedrive_id"), r.get("organizzazione"))
                if org_id:
                    data["org_id"] = org_id
                owner = await R.owner(r.get("owner"))
                if owner:
                    data["owner_id"] = owner
                if r.get("owner"):
                    data["owner_import"] = r["owner"]
                existing = await db.persons.find_one({"pipedrive_id": r["pipedrive_id"]}, {"_id": 0}) if r.get("pipedrive_id") else None
                if not existing:
                    dups = await find_duplicates(data.get("email"), data.get("telefono"))
                    existing = await db.persons.find_one({"id": dups[0]["id"]}, {"_id": 0}) if dups else None
                if existing:
                    merged = person_computed({**existing, **{k: v for k, v in data.items() if v}, "pipedrive_id": r.get("pipedrive_id") or existing.get("pipedrive_id")})
                    await db.persons.replace_one({"id": existing["id"]}, merged)
                    stats["aggiornati"] += 1
                else:
                    created = iso_or_now(r.get("created_at"))
                    doc = person_computed({"id": new_id(), "etichette": [], "owner_id": None, **data, "pipedrive_id": r.get("pipedrive_id"),
                                           "da_assegnare": False, "source": "pipedrive", "created_at": created,
                                           "updated_at": iso_or_now(r.get("updated_at")) if r.get("updated_at") else created})
                    await db.persons.insert_one(doc)
                    stats["creati"] += 1
            elif kind == "deals":
                if not r.get("titolo"):
                    stats["saltati"] += 1
                    continue
                p = await R.person(r.get("person_pipedrive_id"), r.get("persona"), r.get("email"))
                fase = map_fase(r.get("fase"), r.get("stato"))
                try:
                    valore = float(str(r.get("valore") or "0").replace("€", "").replace(".", "").replace(",", ".").strip() or 0) if r.get("valore") and "," in r["valore"] else float(r.get("valore") or 0)
                except ValueError:
                    valore = 0
                data = {"titolo": r["titolo"], "valore": valore, "person_id": p["id"] if p else None,
                        "org_id": await R.org(r.get("org_pipedrive_id"), r.get("organizzazione")),
                        "owner_id": await R.owner(r.get("owner")) or (p or {}).get("owner_id"), "owner_import": r.get("owner"),
                        "fase": fase, "status": fase_status(fase), "etichetta": r.get("etichetta")}
                existing = await R.deal(r.get("pipedrive_id")) if r.get("pipedrive_id") else None
                if existing:
                    await db.deals.update_one({"id": existing["id"]}, {"$set": data})
                    stats["aggiornati"] += 1
                else:
                    created = iso_or_now(r.get("created_at"))
                    await db.deals.insert_one({"id": new_id(), **data, "pipedrive_id": r.get("pipedrive_id"), "created_at": created,
                                               "updated_at": created, **({"closed_at": iso_or_now(r.get("closed_at"))} if r.get("closed_at") else {})})
                    stats["creati"] += 1
            elif kind == "activities":
                d = parse_dt(r.get("data"))
                if not d:
                    stats["saltati"] += 1
                    continue
                p = await R.person(r.get("person_pipedrive_id"), r.get("persona"), r.get("email"))
                deal = await R.deal(r.get("deal_pipedrive_id"), r.get("affare"), p["id"] if p else None)
                ora = r.get("ora") or (d.strftime("%H:%M") if (d.hour or d.minute) else None)
                done_txt = (r.get("done") or "").lower()
                done = done_txt in ("1", "true", "si", "sì", "yes", "fatto", "done", "completata", "completato")
                data = {"tipo": map_tipo(r.get("tipo") or "", r.get("oggetto") or ""), "oggetto": r.get("oggetto") or "Attività",
                        "data": d.date().isoformat(), "ora": ora[:5] if ora else None, "note": r.get("note"), "done": done,
                        "person_id": p["id"] if p else (deal or {}).get("person_id"), "deal_id": deal["id"] if deal else None,
                        "owner_id": await R.owner(r.get("owner")) or (p or {}).get("owner_id")}
                if done:
                    data["done_at"] = iso_or_now(r.get("done_at") or r.get("data"))
                existing = await db.activities.find_one({"pipedrive_id": r["pipedrive_id"]}, {"_id": 0, "id": 1}) if r.get("pipedrive_id") else None
                if existing:
                    await db.activities.update_one({"id": existing["id"]}, {"$set": data})
                    stats["aggiornati"] += 1
                else:
                    await db.activities.insert_one({"id": new_id(), **data, "pipedrive_id": r.get("pipedrive_id"), "created_at": iso_or_now(r.get("created_at"))})
                    stats["creati"] += 1
            elif kind == "notes":
                if not r.get("content"):
                    stats["saltati"] += 1
                    continue
                p = await R.person(r.get("person_pipedrive_id"), r.get("persona"), r.get("email"))
                deal = await R.deal(r.get("deal_pipedrive_id"), r.get("affare"), p["id"] if p else None)
                pid = p["id"] if p else (deal or {}).get("person_id")
                if not (pid or deal):
                    stats["saltati"] += 1
                    continue
                if r.get("pipedrive_id") and await db.notes.find_one({"pipedrive_id": r["pipedrive_id"]}, {"_id": 1}):
                    stats["saltati"] += 1
                    continue
                content = re.sub(r"<br\s*/?>", "\n", r["content"])
                content = re.sub(r"<[^>]+>", "", content)
                await db.notes.insert_one({"id": new_id(), "content": content, "person_id": pid, "deal_id": deal["id"] if deal else None,
                                           "author_id": await R.owner(r.get("owner")), "author_name": r.get("owner") or "Pipedrive",
                                           "pipedrive_id": r.get("pipedrive_id"), "created_at": iso_or_now(r.get("created_at"))})
                stats["creati"] += 1
            else:
                raise HTTPException(400, "Tipo importazione non valido")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("import row failed: %s", e)
            stats["saltati"] += 1
    return stats


# ---------------- Gestionale contratti (API client; sample data until API is ready) ----------------
def contratti_live():
    return bool(os.environ.get("CONTRATTI_API_URL") and os.environ.get("CONTRATTI_API_KEY"))


async def remote(method, path, member, body=None, params=None):
    try:
        r = await run_in_threadpool(requests.request, method, os.environ["CONTRATTI_API_URL"].rstrip("/") + path,
                                    headers={"X-Api-Key": os.environ["CONTRATTI_API_KEY"], "X-Acting-User": member.get("email") or "",
                                             "X-Acting-User-Name": member.get("name") or ""}, json=body, params=params, timeout=30)
    except requests.RequestException as e:
        raise HTTPException(502, f"Gestionale contratti non raggiungibile: {e}")
    if r.status_code >= 400:
        raise HTTPException(502 if r.status_code >= 500 else r.status_code, f"Gestionale contratti: {r.text[:200]}")
    return r.json()


class RigaIn(BaseModel):
    prodotto_id: str
    quantita: int = 1
    sconto_pct: float = 0


class PropostaIn(BaseModel):
    deal_id: str
    righe: List[RigaIn]
    scadenza: str
    modalita_pagamento: str = "bonifico"
    num_rate: int = 1
    note: Optional[str] = None
    invia: bool = False


class PromemoriaIn(BaseModel):
    promemoria_id: str
    data_ora: str


class ProrogaIn(BaseModel):
    scadenza: str


class SimulaIn(BaseModel):
    evento: str


PAGAMENTI = {"bonifico": "Bonifico", "rate": "Rate", "link": "Link di pagamento"}


async def _build_proposta(body: PropostaIn, member: dict) -> dict:
    deal = await db.deals.find_one({"id": body.deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(404, "Affare non trovato")
    person = await db.persons.find_one({"id": deal.get("person_id")}, {"_id": 0}) if deal.get("person_id") else None
    if not person or not person.get("email"):
        raise HTTPException(400, "Il contatto dell'affare deve avere un'email")
    if body.modalita_pagamento not in PAGAMENTI:
        raise HTTPException(400, "Modalità di pagamento non valida")
    if not body.righe:
        raise HTTPException(400, "Aggiungi almeno un prodotto")
    righe = []
    for r in body.righe:
        p = await db.products.find_one({"id": r.prodotto_id}, {"_id": 0})
        if not p:
            raise HTTPException(400, "Prodotto non trovato nel catalogo")
        q, s = max(1, r.quantita), min(100.0, max(0.0, r.sconto_pct))
        righe.append({"prodotto_id": p["id"], "nome": p["nome"], "erogatore": p["erogatore"], "prezzo": p["prezzo"], "prezzo_minimo": p["prezzo_minimo"],
                      "quantita": q, "sconto_pct": s, "totale": round(p["prezzo"] * q * (1 - s / 100), 2)})
    totale = round(sum(r["totale"] for r in righe), 2)
    sotto_minimo = any(r["totale"] / r["quantita"] < r["prezzo_minimo"] for r in righe)
    nome = person.get("nome") or person["full_name"]
    elenco = "\n".join(f"• {r['nome']} × {r['quantita']}" + (f" (sconto {r['sconto_pct']:g}%)" if r["sconto_pct"] else "") + f": € {r['totale']:.2f}" for r in righe)
    rate_txt = f" in {body.num_rate} rate" if body.modalita_pagamento == "rate" else ""
    email = {"a": person["email"], "oggetto": f"ITALIACORSI – La tua proposta per {righe[0]['nome']}",
             "corpo": f"Gentile {nome},\n\ncome concordato le inviamo la proposta personalizzata:\n\n{elenco}\n\nTotale: € {totale:.2f}\n"
                      f"Pagamento: {PAGAMENTI[body.modalita_pagamento]}{rate_txt}\nLa proposta è valida fino al {body.scadenza}.\n\n"
                      f"Può visualizzarla e accettarla dal link qui sotto.\n\nCordiali saluti,\n{member['name']}\nITALIACORSI"}
    return {"deal": deal, "person": person, "righe": righe, "totale": totale, "sotto_minimo": sotto_minimo, "email": email}


def _rate_plan(totale, n, start):
    n = max(1, min(12, n))
    base = round(totale / n, 2)
    d0 = datetime.fromisoformat(start)
    return [{"n": i + 1, "importo": base if i < n - 1 else round(totale - base * (n - 1), 2),
             "scadenza": (d0 + timedelta(days=30 * i)).date().isoformat(), "pagata": False} for i in range(n)]


@api.get("/contratti/stato")
async def contratti_stato(member: dict = Depends(staff)):
    return {"modalita": "live" if contratti_live() else "esempio"}


@api.post("/contratti/anteprima")
async def proposta_anteprima(body: PropostaIn, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("POST", "/proposte/anteprima", member, body.model_dump())
    b = await _build_proposta(body, member)
    return {"righe": b["righe"], "totale": b["totale"], "sotto_minimo": b["sotto_minimo"], "email": b["email"],
            "cliente": {"nome": b["person"]["full_name"], "email": b["person"]["email"]}}


@api.get("/contratti/proposte")
async def proposte_list(deal_id: str = "", person_id: str = "", member: dict = Depends(staff)):
    if contratti_live():
        return await remote("GET", "/proposte", member, params={"crm_deal_id": deal_id, "crm_person_id": person_id})
    flt = {**({"crm_deal_id": deal_id} if deal_id else {}), **({"crm_person_id": person_id} if person_id else {})}
    if not flt:
        return []
    return await db.mock_proposte.find(flt, {"_id": 0}).sort("creata_at", -1).to_list(100)


async def _mock_get(prop_id):
    p = await db.mock_proposte.find_one({"id": prop_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Proposta non trovata")
    return p


async def _mock_save(p, event=None, **extra):
    await db.mock_proposte.replace_one({"id": p["id"]}, p)
    if event:
        await apply_contratti_event({"event": event, "proposta_id": p["id"], "crm_deal_id": p["crm_deal_id"], **extra})
    return p


def _mock_send(p, member, tipo="Invio proposta"):
    t = datetime.now(ROME).replace(second=0, microsecond=0)
    p["stato"] = "inviata" if p["stato"] in ("bozza", "inviata") else p["stato"]
    p["inviata_at"] = p.get("inviata_at") or now_iso()
    p["email_log"].append({"at": now_iso(), "tipo": tipo, "oggetto": p["email"]["oggetto"], "da": member["name"]})
    if not p["promemoria"]:
        p["promemoria"] = [{"id": new_id(), "data_ora": (t + timedelta(days=d)).replace(hour=10, minute=0).isoformat(), "stato": "programmato"} for d in (3, 7)]


@api.post("/contratti/proposte")
async def proposta_create(body: PropostaIn, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("POST", "/proposte", member, body.model_dump())
    b = await _build_proposta(body, member)
    n = await db.mock_proposte.count_documents({}) + 1
    pid = f"PR-{datetime.now(ROME).year}-{n:04d}"
    pag = {"modalita": body.modalita_pagamento, "stato": "in_attesa", "importo_pagato": 0, "iban": "IT60 X054 2811 1010 0000 0123 456",
           "link_pagamento": f"https://contratti.italiacorsi.it/paga/{pid}" if body.modalita_pagamento == "link" else None,
           "rate": _rate_plan(b["totale"], body.num_rate, body.scadenza) if body.modalita_pagamento == "rate" else []}
    p = {"id": pid, "crm_deal_id": body.deal_id, "crm_person_id": b["person"]["id"], "commerciale": member["name"], "commerciale_email": member.get("email"),
         "cliente": {"nome": b["person"]["full_name"], "email": b["person"]["email"], "telefono": b["person"].get("telefono")},
         "righe": b["righe"], "totale": b["totale"], "scadenza": body.scadenza, "modalita_pagamento": body.modalita_pagamento, "num_rate": body.num_rate,
         "note": body.note, "stato": "bozza", "creata_at": now_iso(), "inviata_at": None, "aperture": [], "promemoria": [], "email": b["email"],
         "email_log": [], "pagamento": pag, "lms": {"stato": "non_creato", "username": None, "inviate_at": []}, "fattura": None,
         "url_pubblico": f"https://contratti.italiacorsi.it/p/{pid}"}
    await db.mock_proposte.insert_one(dict(p))
    await db.deals.update_one({"id": body.deal_id}, {"$addToSet": {"proposte": pid}, "$set": {"valore": b["totale"], "proposta_id": pid,
                                                                                          "prodotti": [r["prodotto_id"] for r in b["righe"]], "updated_at": now_iso()}})
    await log(f"Proposta {pid} creata da {member['name']} · € {b['totale']:.2f}", member, kind="contratti", person_id=b["person"]["id"], deal_id=body.deal_id)
    if body.invia:
        _mock_send(p, member)
        await _mock_save(p, "proposta_inviata", valore=p["totale"])
    return p


@api.get("/contratti/proposte/{prop_id}")
async def proposta_get(prop_id: str, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("GET", f"/proposte/{prop_id}", member)
    return await _mock_get(prop_id)


@api.post("/contratti/proposte/{prop_id}/invia")
async def proposta_invia(prop_id: str, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("POST", f"/proposte/{prop_id}/invia", member)
    p = await _mock_get(prop_id)
    if p["stato"] != "bozza":
        raise HTTPException(409, "Proposta già inviata: usa Reinvia mail")
    _mock_send(p, member)
    return await _mock_save(p, "proposta_inviata", valore=p["totale"])


@api.post("/contratti/proposte/{prop_id}/reinvia")
async def proposta_reinvia(prop_id: str, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("POST", f"/proposte/{prop_id}/reinvia", member)
    p = await _mock_get(prop_id)
    if p["stato"] == "bozza":
        raise HTTPException(409, "La proposta non è ancora stata inviata")
    _mock_send(p, member, "Reinvio mail")
    return await _mock_save(p, "mail_reinviata", dettaglio=f"da {member['name']}")


@api.patch("/contratti/proposte/{prop_id}/promemoria")
async def proposta_promemoria(prop_id: str, body: PromemoriaIn, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("PATCH", f"/proposte/{prop_id}/promemoria", member, body.model_dump())
    p = await _mock_get(prop_id)
    rem = next((r for r in p["promemoria"] if r["id"] == body.promemoria_id), None)
    if not rem or rem["stato"] != "programmato":
        raise HTTPException(400, "Promemoria non modificabile")
    rem["data_ora"] = body.data_ora
    return await _mock_save(p, "promemoria_modificato", dettaglio=body.data_ora.replace("T", " ")[:16])


@api.post("/contratti/proposte/{prop_id}/proroga")
async def proposta_proroga(prop_id: str, body: ProrogaIn, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("POST", f"/proposte/{prop_id}/proroga", member, body.model_dump())
    p = await _mock_get(prop_id)
    if body.scadenza <= p["scadenza"]:
        raise HTTPException(400, "La nuova scadenza deve essere successiva a quella attuale")
    p["scadenza"] = body.scadenza
    if p["stato"] == "scaduta":
        p["stato"] = "inviata"
    return await _mock_save(p, "proposta_prorogata", dettaglio=f"nuova scadenza {body.scadenza}")


@api.post("/contratti/proposte/{prop_id}/lms")
async def proposta_lms(prop_id: str, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("POST", f"/proposte/{prop_id}/lms", member)
    p = await _mock_get(prop_id)
    if p["stato"] not in ("accettata", "pagata"):
        raise HTTPException(409, "Le credenziali LMS si creano dopo l'accettazione della proposta")
    first = p["lms"]["stato"] == "non_creato"
    p["lms"] = {"stato": "attivo", "username": p["lms"]["username"] or p["cliente"]["email"],
                "piattaforma": "https://lms.italiacorsi.it", "inviate_at": p["lms"]["inviate_at"] + [now_iso()]}
    return await _mock_save(p, "lms_creato" if first else "lms_reinviato")


@api.get("/contratti/proposte/{prop_id}/fattura")
async def proposta_fattura(prop_id: str, member: dict = Depends(staff)):
    if contratti_live():
        return await remote("GET", f"/proposte/{prop_id}/fattura", member)
    p = await _mock_get(prop_id)
    if not p.get("fattura"):
        raise HTTPException(404, "Fattura non ancora emessa")
    return p["fattura"]


@api.post("/contratti/proposte/{prop_id}/simula")
async def proposta_simula(prop_id: str, body: SimulaIn, member: dict = Depends(staff)):
    """Sample-data only: simulates what contratti will do on its own (opening, payment, ...)."""
    if contratti_live():
        raise HTTPException(400, "Simulazione disponibile solo con dati di esempio")
    p = await _mock_get(prop_id)
    ev = body.evento
    if p["stato"] == "bozza":
        raise HTTPException(409, "Invia prima la proposta")
    if ev == "apertura":
        p["aperture"].append({"at": now_iso(), "dispositivo": "Mobile"})
        if p["stato"] == "inviata":
            p["stato"] = "aperta"
        return await _mock_save(p, "proposta_aperta")
    if ev == "promemoria":
        rem = next((r for r in p["promemoria"] if r["stato"] == "programmato"), None)
        if not rem:
            raise HTTPException(409, "Nessun promemoria programmato")
        rem["stato"] = "inviato"
        p["email_log"].append({"at": now_iso(), "tipo": "Promemoria automatico", "oggetto": p["email"]["oggetto"], "da": "Sistema"})
        return await _mock_save(p, "remind_inviato")
    if ev == "accettata":
        p["stato"] = "accettata"
        for r in p["promemoria"]:
            if r["stato"] == "programmato":
                r["stato"] = "annullato"
        return await _mock_save(p, "aggiudicato", valore=p["totale"])
    if ev == "pagamento":
        pag = p["pagamento"]
        if pag["rate"]:
            rata = next((r for r in pag["rate"] if not r["pagata"]), None)
            if not rata:
                raise HTTPException(409, "Tutte le rate sono pagate")
            rata["pagata"] = True
            pag["importo_pagato"] = round(pag["importo_pagato"] + rata["importo"], 2)
        else:
            pag["importo_pagato"] = p["totale"]
        pag["stato"] = "pagato" if pag["importo_pagato"] >= p["totale"] else "parziale"
        if pag["stato"] == "pagato":
            p["stato"] = "pagata"
            n = await db.mock_proposte.count_documents({"fattura": {"$ne": None}}) + 1
            p["fattura"] = {"numero": f"FT-{datetime.now(ROME).year}/{n:04d}", "data": today().isoformat(), "importo": p["totale"],
                            "pdf_url": f"https://contratti.italiacorsi.it/fatture/{p['id']}.pdf"}
        if p["stato"] not in ("accettata", "pagata"):
            p["stato"] = "accettata"
        await _mock_save(p, "pagamento_ricevuto", dettaglio=f"€ {pag['importo_pagato']:.2f} di € {p['totale']:.2f}")
        if p.get("fattura"):
            await apply_contratti_event({"event": "fattura_emessa", "proposta_id": p["id"], "crm_deal_id": p["crm_deal_id"], "dettaglio": p["fattura"]["numero"]})
        return p
    if ev == "perso":
        p["stato"] = "persa"
        return await _mock_save(p, "perso", motivo="Rifiutata dal cliente")
    raise HTTPException(400, "Evento non valido")


# ---------------- Products (read-only from contratti.italiacorsi.it) ----------------
SAMPLE_PRODUCTS = [
    {"id": "ex-1", "nome": "Abbonamento Premium annuale", "prezzo": 290, "prezzo_minimo": 250, "erogatore": "ITALIACORSI", "tipo": "abbonamento", "incluso_in": None},
    {"id": "ex-2", "nome": "Abbonamento CTI Premium", "prezzo": 360, "prezzo_minimo": 320, "erogatore": "ITALIACORSI", "tipo": "abbonamento", "incluso_in": None},
    {"id": "ex-3", "nome": "Corso Carbon Farming", "prezzo": 450, "prezzo_minimo": 350, "erogatore": "ITALIACORSI", "tipo": "corso", "incluso_in": None},
    {"id": "ex-4", "nome": "Corso CAM Edilizia (8 ore)", "prezzo": 220, "prezzo_minimo": 180, "erogatore": "P-learning", "tipo": "corso", "incluso_in": "Abbonamento CTI Premium"},
    {"id": "ex-5", "nome": "Percorso Intelligenza Artificiale M3", "prezzo": 1490, "prezzo_minimo": 1029, "erogatore": "ITALIACORSI", "tipo": "corso", "incluso_in": None},
    {"id": "ex-6", "nome": "Modulo 2 - Studio tecnico intelligente", "prezzo": 350, "prezzo_minimo": 300, "erogatore": "ITALIACORSI", "tipo": "corso", "incluso_in": "Percorso Intelligenza Artificiale M3"},
    {"id": "ex-7", "nome": "Corso Interior e Visual Design AI", "prezzo": 397, "prezzo_minimo": 340, "erogatore": "P-learning", "tipo": "corso", "incluso_in": "Abbonamento Premium annuale"},
    {"id": "ex-8", "nome": "Corso BIM base (archiviato)", "prezzo": 300, "prezzo_minimo": 250, "erogatore": "P-learning", "tipo": "corso", "incluso_in": None, "attivo": False},
]


def _norm_product(p: dict) -> dict:
    return {"id": str(p.get("id")), "nome": p.get("nome") or "", "prezzo": float(p.get("prezzo") or 0),
            "prezzo_minimo": float(p.get("prezzo_minimo") or p.get("prezzo_minimo_consigliato") or 0),
            "erogatore": p.get("erogatore") or "ITALIACORSI", "tipo": p.get("tipo") or "corso",
            "incluso_in": p.get("incluso_in") or p.get("abbonamento") or None,
            "pdf_url": p.get("pdf_url") or p.get("link_pdf") or None, "attivo": p.get("attivo", True) is not False}


async def sync_products():
    if contratti_live():
        r = await run_in_threadpool(requests.get, os.environ["CONTRATTI_API_URL"].rstrip("/") + "/prodotti",
                                    headers={"X-Api-Key": os.environ["CONTRATTI_API_KEY"]}, timeout=30)
        r.raise_for_status()
        data = r.json()
        items, source = [_norm_product(p) for p in (data.get("prodotti", data) if isinstance(data, dict) else data)], "contratti"
    else:
        items, source = [_norm_product({**p, "pdf_url": f"https://contratti.italiacorsi.it/schede/{p['id']}.pdf"}) for p in SAMPLE_PRODUCTS], "esempio"
    for p in items:
        await db.products.update_one({"id": p["id"]}, {"$set": {**p, "synced_at": now_iso()}}, upsert=True)
    await db.products.delete_many({"id": {"$nin": [p["id"] for p in items]}})
    await db.meta.update_one({"key": "products_sync"}, {"$set": {"at": now_iso(), "source": source, "count": len(items)}}, upsert=True)
    return {"source": source, "count": len(items)}


@app.on_event("startup")
async def seed_products():
    if await db.products.count_documents({}) == 0:
        try:
            await sync_products()
        except Exception as e:
            logger.warning("product sync failed: %s", e)


@api.get("/products")
async def list_products(all: bool = False, member: dict = Depends(staff)):
    items = await db.products.find({} if all else {"attivo": True}, {"_id": 0}).sort("nome", 1).to_list(1000)
    meta = await db.meta.find_one({"key": "products_sync"}, {"_id": 0}) or {}
    return {"items": items, "sync": meta}


@api.post("/products/sync")
async def products_sync_now(admin: dict = Depends(admin_only)):
    try:
        return await sync_products()
    except Exception as e:
        raise HTTPException(502, f"Collegamento al gestionale contratti non riuscito: {e}")


@api.post("/cron/sync-prodotti")
async def cron_sync_products(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret or not auth.lower().startswith("bearer ") or not hmac.compare_digest(auth[7:], secret):
        raise HTTPException(401, "Unauthorized")
    run_id = request.headers.get("X-Webhook-Id") or new_id()
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "at": now_iso()})

    async def job():
        try:
            await sync_products()
        except Exception as e:
            logger.warning("cron product sync failed: %s", e)
    background.add_task(job)
    return {"ok": True}


app.include_router(api)
app.include_router(clerk_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
