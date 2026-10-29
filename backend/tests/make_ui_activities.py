"""Seed TEST_ person + deal + planned activities for ActivityCard feedback UI testing. Prints JSON."""
import json, uuid, datetime, requests
for line in open("/app/frontend/.env"):
    if line.startswith("REACT_APP_BACKEND_URL="):
        B = line.split("=", 1)[1].strip().rstrip("/") + "/api"
tok = json.load(open("/tmp/tokens.json"))
t = tok["Angelo"]["token"]; uid = tok["Angelo"]["id"]
s = requests.Session(); s.headers["Authorization"] = f"Bearer {t}"
u = uuid.uuid4().hex[:6]
p = s.post(f"{B}/persons", json={"nome": "TEST_UI", "cognome": f"Act{u}", "email": f"test_act_{u}@example.com", "force": True}).json()
d = s.post(f"{B}/deals", json={"titolo": f"TEST_ActDeal_{u}", "valore": 100, "person_id": p["id"]}).json()
today = datetime.date.today().isoformat()
acts = {}
for k in ["A", "B", "C", "D"]:
    r = s.post(f"{B}/activities", json={"tipo": "chiamata", "oggetto": f"TEST_Act{k}_{u}", "data": today, "person_id": p["id"]})
    acts[k] = r.json()["id"]
r = s.post(f"{B}/activities", json={"tipo": "chiamata", "oggetto": f"TEST_DealAct_{u}", "data": today, "person_id": p["id"], "deal_id": d["id"]})
acts["DEAL"] = r.json()["id"]
print(json.dumps({"pid": p["id"], "did": d["id"], "u": u, "acts": acts}))
