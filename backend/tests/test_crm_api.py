"""ITALIACORSI CRM backend regression tests (roles, persons, leads webhook, deals, activities, contratti mock, import, cron).
Run serially (tests share state): pytest tests/test_crm_api.py -n 0  (after python tests/make_test_users.py)"""
import uuid
from datetime import date, timedelta
import pytest
import requests

U = uuid.uuid4().hex[:8]
CREATED = {"persons": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin, base):
    yield
    for pid in CREATED["persons"]:
        admin.delete(f"{base}/persons/{pid}")
    for d in admin.get(f"{base}/deals", params={"q": "TEST_", "limit": 200}).json()["items"]:
        if not d.get("person_id"):
            admin.delete(f"{base}/deals/{d['id']}")
    for o in admin.get(f"{base}/organizations", params={"q": "TEST_"}).json()["items"]:
        admin.delete(f"{base}/organizations/{o['id']}")


# ---- Roles / auth ----
class TestRoles:
    def test_no_token_401(self, base):
        assert requests.get(f"{base}/persons").status_code == 401

    def test_in_attesa_403(self, nuovo, base):
        assert nuovo.get(f"{base}/persons").status_code == 403
        me = nuovo.get(f"{base}/me")
        assert me.status_code == 200 and me.json()["role"] == "in_attesa"

    def test_commerciale_forbidden(self, luca, base):
        assert luca.get(f"{base}/admin/integrations").status_code == 403
        assert luca.post(f"{base}/import/persons", json={"rows": []}).status_code == 403
        assert luca.delete(f"{base}/persons/nonexistent").status_code == 403
        assert luca.get(f"{base}/persons").status_code == 200

    def test_admin_me(self, admin, base):
        assert admin.get(f"{base}/me").json()["role"] == "admin"


# ---- Persons: duplicates / take ----
class TestPersons:
    def test_create_dup_force(self, luca, base):
        email = f"test_{U}@example.com"
        r = luca.post(f"{base}/persons", json={"nome": "TEST_Dup", "cognome": U, "email": email, "telefono": "+39 333 111 " + U[:4]})
        assert r.status_code == 200, r.text
        p = r.json(); CREATED["persons"].append(p["id"])
        assert p["full_name"] == f"TEST_Dup {U}"
        r2 = luca.post(f"{base}/persons", json={"nome": "TEST_Dup2", "email": email.upper()})
        assert r2.status_code == 409
        assert any(d["id"] == p["id"] for d in r2.json()["detail"]["duplicates"])
        r3 = luca.post(f"{base}/persons", json={"nome": "TEST_Dup2", "email": email, "force": True})
        assert r3.status_code == 200
        CREATED["persons"].append(r3.json()["id"])
        g = luca.get(f"{base}/persons/{p['id']}")
        assert g.status_code == 200 and g.json()["person"]["email"] == email

    def test_check_duplicates_endpoint(self, luca, base):
        r = luca.get(f"{base}/persons/check-duplicates", params={"email": f"TEST_{U}@example.com"})
        assert r.status_code == 200 and len(r.json()) >= 1


# ---- Leads webhook ----
class TestLeads:
    def test_wrong_secret(self, base):
        r = requests.post(f"{base}/webhooks/leads", json={"email": "x@y.it"}, headers={"X-Leads-Secret": "bad"})
        assert r.status_code == 401

    def test_lead_create_merge_take(self, base, secrets, luca, carla, admin):
        h = {"X-Leads-Secret": secrets["leads_secret"]}
        phone = f"33{U[:0]}9{abs(hash(U)) % 10**7:07d}"
        r = requests.post(f"{base}/webhooks/leads", headers=h, json={"nome": "TEST_Lead", "cognome": U, "email": f"lead_{U}@example.com",
                                                                     "telefono": phone, "prodotto_richiesto": "TEST_Corso Carbon Farming", "fonte": "Facebook"})
        assert r.status_code == 200, r.text
        d = r.json(); pid = d["person_id"]; CREATED["persons"].append(pid)
        assert d["duplicate"] is False
        g = luca.get(f"{base}/persons/{pid}").json()
        assert g["person"]["da_assegnare"] is True and g["person"]["owner_id"] is None
        assert g["deals"][0]["fase"] == "Contatto ricevuto"
        # duplicate via phone with +39 prefix
        r2 = requests.post(f"{base}/webhooks/leads", headers=h, json={"nome": "TEST_Lead2", "telefono": "+39 " + phone, "prodotto_richiesto": "TEST_Dup request", "fonte": "Sito"})
        assert r2.status_code == 200 and r2.json()["duplicate"] is True and r2.json()["person_id"] == pid
        lst = luca.get(f"{base}/persons", params={"view": "da_assegnare"}).json()
        assert any(i["id"] == pid for i in lst["items"])
        # take
        t = luca.post(f"{base}/persons/{pid}/take")
        assert t.status_code == 200
        t2 = carla.post(f"{base}/persons/{pid}/take")
        assert t2.status_code == 409
        g = luca.get(f"{base}/persons/{pid}").json()
        me = luca.get(f"{base}/me").json()
        assert g["person"]["owner_id"] == me["user_id"] and g["person"]["da_assegnare"] is False
        assert all(dl["owner_id"] == me["user_id"] for dl in g["deals"])
        assert any(a["oggetto"] == "Chiamata nuovo lead" for a in g["activities"])
        pytest.lead_pid = pid
        pytest.lead_deal = g["deals"][0]["id"]


# ---- Activities ----
class TestActivities:
    def test_crud_and_periods(self, luca, base):
        pid = CREATED["persons"][0]
        t = date.today()
        ids = {}
        for k, d in [("oggi", t), ("ritardo", t - timedelta(days=3)), ("domani", t + timedelta(days=1))]:
            r = luca.post(f"{base}/activities", json={"tipo": "richiamo", "oggetto": f"TEST_{k}_{U}", "data": d.isoformat(), "ora": "10:00", "person_id": pid})
            assert r.status_code == 200, r.text
            ids[k] = r.json()["id"]
        assert luca.post(f"{base}/activities", json={"tipo": "xx", "data": t.isoformat()}).status_code == 400
        counts = luca.get(f"{base}/activities/counts").json()
        assert counts["oggi"] >= 1 and counts["ritardo"] >= 1 and counts["domani"] >= 1
        for k in ids:
            items = luca.get(f"{base}/activities", params={"period": k}).json()["items"]
            assert any(i["id"] == ids[k] for i in items), k
        sett = luca.get(f"{base}/activities", params={"period": "settimana"}).json()["items"]
        assert any(i["id"] == ids["oggi"] for i in sett)
        # reschedule + done
        new_day = (t + timedelta(days=30)).isoformat()
        u = luca.patch(f"{base}/activities/{ids['ritardo']}", json={"data": new_day})
        assert u.status_code == 200 and u.json()["data"] == new_day
        dn = luca.patch(f"{base}/activities/{ids['oggi']}", json={"done": True})
        assert dn.json()["done"] is True and dn.json()["done_at"]
        de = luca.delete(f"{base}/activities/{ids['domani']}")
        assert de.status_code == 200
        items = luca.get(f"{base}/activities", params={"period": "domani"}).json()["items"]
        assert not any(i["id"] == ids["domani"] for i in items)


# ---- Deals ----
class TestDeals:
    def test_pipeline_and_patch_fase(self, luca, base):
        pid = CREATED["persons"][0]
        r = luca.post(f"{base}/deals", json={"titolo": f"TEST_Deal_{U}", "valore": 100, "person_id": pid})
        assert r.status_code == 200
        did = r.json()["id"]
        pl = luca.get(f"{base}/deals/pipeline").json()
        assert [s["fase"] for s in pl] == ["Contatto ricevuto", "Contatto chiamato", "Proposta inviata", "Remind inviati", "Aggiudicato", "Perso"]
        assert any(i["id"] == did for i in pl[0]["items"])
        p = luca.patch(f"{base}/deals/{did}", json={"fase": "Contatto chiamato"})
        assert p.status_code == 200 and p.json()["fase"] == "Contatto chiamato"
        assert luca.patch(f"{base}/deals/{did}", json={"fase": "Bogus"}).status_code == 400
        hist = luca.get(f"{base}/persons/{pid}").json()["history"]
        assert any(h["kind"] == "stage" and "Contatto chiamato" in h["text"] for h in hist)
        pytest.deal_id = did


# ---- Contratti webhook ----
class TestContrattiWebhook:
    def test_wrong_secret(self, base):
        r = requests.post(f"{base}/webhooks/contratti", json={"event": "perso"}, headers={"X-Webhook-Secret": "bad"})
        assert r.status_code == 401

    def test_events(self, base, secrets, luca):
        h = {"X-Webhook-Secret": secrets["webhook_secret"]}
        did = pytest.deal_id
        pid = CREATED["persons"][0]
        for ev, fase in [("proposta_inviata", "Proposta inviata"), ("remind_inviato", "Remind inviati"), ("aggiudicato", "Aggiudicato")]:
            r = requests.post(f"{base}/webhooks/contratti", headers=h, json={"event": ev, "crm_deal_id": did, "proposta_id": f"EXT-{U}"})
            assert r.status_code == 200 and r.json()["fase"] == fase, r.text
        r = requests.post(f"{base}/webhooks/contratti", headers=h, json={"event": "pagamento_ricevuto", "crm_deal_id": did, "dettaglio": "€ 100"})
        assert r.status_code == 200
        r = requests.post(f"{base}/webhooks/contratti", headers=h, json={"event": "perso", "crm_deal_id": did, "motivo": "Prezzo"})
        assert r.json()["fase"] == "Perso"
        assert requests.post(f"{base}/webhooks/contratti", headers=h, json={"event": "boh"}).status_code == 200
        assert requests.post(f"{base}/webhooks/contratti", headers=h, json={}).status_code == 400
        d = luca.get(f"{base}/persons/{pid}").json()
        deal = next(x for x in d["deals"] if x["id"] == did)
        assert deal["status"] == "lost" and deal["motivo_perso"] == "Prezzo"
        assert any("Pagamento ricevuto" in x["text"] for x in d["history"])


# ---- Contratti mock flow ----
class TestProposte:
    def test_products(self, luca, base):
        items = luca.get(f"{base}/products").json()["items"]
        assert len(items) == 7 and all(p["attivo"] for p in items)

    def test_flow(self, luca, base):
        did = pytest.lead_deal
        scad = (date.today() + timedelta(days=10)).isoformat()
        body = {"deal_id": did, "righe": [{"prodotto_id": "ex-3", "quantita": 2, "sconto_pct": 10}], "scadenza": scad,
                "modalita_pagamento": "rate", "num_rate": 3}
        a = luca.post(f"{base}/contratti/anteprima", json=body)
        assert a.status_code == 200, a.text
        assert a.json()["totale"] == 810.0 and "Gentile" in a.json()["email"]["corpo"]
        c = luca.post(f"{base}/contratti/proposte", json={**body, "invia": False})
        assert c.status_code == 200
        p = c.json(); prop = p["id"]
        assert p["stato"] == "bozza" and len(p["pagamento"]["rate"]) == 3
        assert luca.post(f"{base}/contratti/proposte/{prop}/reinvia").status_code == 409
        assert luca.post(f"{base}/contratti/proposte/{prop}/simula", json={"evento": "apertura"}).status_code == 409
        i = luca.post(f"{base}/contratti/proposte/{prop}/invia")
        assert i.status_code == 200 and i.json()["stato"] == "inviata" and len(i.json()["promemoria"]) == 2
        assert luca.post(f"{base}/contratti/proposte/{prop}/invia").status_code == 409
        deal = next(x for x in luca.get(f"{base}/persons/{pytest.lead_pid}").json()["deals"] if x["id"] == did)
        assert deal["fase"] == "Proposta inviata"
        assert luca.post(f"{base}/contratti/proposte/{prop}/reinvia").status_code == 200
        rem = i.json()["promemoria"][0]["id"]
        pm = luca.patch(f"{base}/contratti/proposte/{prop}/promemoria", json={"promemoria_id": rem, "data_ora": "2030-01-01T09:00"})
        assert pm.status_code == 200 and pm.json()["promemoria"][0]["data_ora"] == "2030-01-01T09:00"
        assert luca.post(f"{base}/contratti/proposte/{prop}/proroga", json={"scadenza": "2000-01-01"}).status_code == 400
        pr = luca.post(f"{base}/contratti/proposte/{prop}/proroga", json={"scadenza": "2031-01-01"})
        assert pr.json()["scadenza"] == "2031-01-01"
        assert luca.post(f"{base}/contratti/proposte/{prop}/lms").status_code == 409
        assert luca.get(f"{base}/contratti/proposte/{prop}/fattura").status_code == 404
        s = luca.post(f"{base}/contratti/proposte/{prop}/simula", json={"evento": "apertura"})
        assert s.json()["stato"] == "aperta" and len(s.json()["aperture"]) == 1
        s = luca.post(f"{base}/contratti/proposte/{prop}/simula", json={"evento": "promemoria"})
        assert s.status_code == 200
        deal = next(x for x in luca.get(f"{base}/persons/{pytest.lead_pid}").json()["deals"] if x["id"] == did)
        assert deal["fase"] == "Remind inviati"
        s = luca.post(f"{base}/contratti/proposte/{prop}/simula", json={"evento": "accettata"})
        assert s.json()["stato"] == "accettata"
        l = luca.post(f"{base}/contratti/proposte/{prop}/lms")
        assert l.status_code == 200 and l.json()["lms"]["stato"] == "attivo"
        for _ in range(3):
            s = luca.post(f"{base}/contratti/proposte/{prop}/simula", json={"evento": "pagamento"})
            assert s.status_code == 200
        assert s.json()["stato"] == "pagata" and s.json()["pagamento"]["stato"] == "pagato"
        f = luca.get(f"{base}/contratti/proposte/{prop}/fattura")
        assert f.status_code == 200 and f.json()["numero"].startswith("FT-")
        d = luca.get(f"{base}/persons/{pytest.lead_pid}").json()
        deal = next(x for x in d["deals"] if x["id"] == did)
        assert deal["fase"] == "Aggiudicato"
        assert any("Fattura emessa" in h["text"] for h in d["history"])
        lst = luca.get(f"{base}/contratti/proposte", params={"deal_id": did}).json()
        assert any(x["id"] == prop for x in lst)

    def test_create_and_send_then_perso(self, luca, base):
        pid = CREATED["persons"][0]
        r = luca.post(f"{base}/deals", json={"titolo": f"TEST_Deal2_{U}", "person_id": pid})
        did = r.json()["id"]
        c = luca.post(f"{base}/contratti/proposte", json={"deal_id": did, "righe": [{"prodotto_id": "ex-1"}], "scadenza": "2030-01-01",
                                                          "modalita_pagamento": "bonifico", "invia": True})
        assert c.status_code == 200 and c.json()["stato"] == "inviata"
        s = luca.post(f"{base}/contratti/proposte/{c.json()['id']}/simula", json={"evento": "perso"})
        assert s.json()["stato"] == "persa"
        deal = next(x for x in luca.get(f"{base}/persons/{pid}").json()["deals"] if x["id"] == did)
        assert deal["fase"] == "Perso"


# ---- Import ----
class TestImport:
    def test_import_persons_dedupe(self, admin, base):
        rows = [{"pipedrive_id": f"PD{U}", "full_name": f"TEST_Imp {U}", "email": f"imp_{U}@example.com", "etichette": "interessato, Valuta",
                 "organizzazione": f"TEST_Org_{U}", "primo_contatto": "15/03/2024"}]
        r = admin.post(f"{base}/import/persons", json={"rows": rows})
        assert r.status_code == 200 and r.json()["creati"] == 1, r.text
        r2 = admin.post(f"{base}/import/persons", json={"rows": rows})
        assert r2.json()["aggiornati"] == 1 and r2.json()["creati"] == 0
        found = admin.get(f"{base}/persons", params={"q": f"imp_{U}"}).json()["items"]
        assert len(found) == 1
        p = found[0]; CREATED["persons"].append(p["id"])
        assert p["etichette"] == ["Interessato", "Valuta"] and p["primo_contatto"] == "2024-03-15" and p["org_nome"] == f"TEST_Org_{U}"
        d = admin.post(f"{base}/import/deals", json={"rows": [{"pipedrive_id": f"PDD{U}", "titolo": f"TEST_ImpDeal_{U}", "person_pipedrive_id": f"PD{U}", "stato": "won", "valore": "500"}]})
        assert d.status_code == 200 and d.json()["creati"] == 1, d.text
        a = admin.post(f"{base}/import/activities", json={"rows": [{"pipedrive_id": f"PDA{U}", "oggetto": "Follow up telefonico", "person_pipedrive_id": f"PD{U}", "data": "2024-05-01"}]})
        assert a.status_code == 200 and a.json()["creati"] == 1, a.text
        n = admin.post(f"{base}/import/notes", json={"rows": [{"pipedrive_id": f"PDN{U}", "content": "<b>Ciao</b><br>riga", "person_pipedrive_id": f"PD{U}"}]})
        assert n.status_code == 200 and n.json()["creati"] == 1, n.text
        o = admin.post(f"{base}/import/organizations", json={"rows": [{"pipedrive_id": f"PDO{U}", "nome": f"TEST_Org2_{U}"}]})
        assert o.status_code == 200 and o.json()["creati"] == 1
        g = admin.get(f"{base}/persons/{p['id']}").json()
        assert any(x["titolo"] == f"TEST_ImpDeal_{U}" and x["fase"] == "Aggiudicato" for x in g["deals"])
        assert any(x["tipo"] == "follow_up" for x in g["activities"])
        assert any(x["content"] == "Ciao\nriga" for x in g["notes"])
        assert admin.post(f"{base}/import/bogus", json={"rows": [{"a": "b"}]}).status_code == 400


# ---- Cron ----
class TestCron:
    def test_cron_401(self, base):
        assert requests.post(f"{base}/cron/sync-prodotti").status_code == 401
        assert requests.post(f"{base}/cron/sync-prodotti", headers={"Authorization": "Bearer wrong"}).status_code == 401


# ---- Admin delete ----
class TestDelete:
    def test_admin_delete_person(self, admin, luca, base):
        r = luca.post(f"{base}/persons", json={"nome": "TEST_Del", "cognome": U, "force": True})
        pid = r.json()["id"]
        assert admin.delete(f"{base}/persons/{pid}").status_code == 200
        assert admin.get(f"{base}/persons/{pid}").status_code == 404
