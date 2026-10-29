"""Deal detail page backend tests (GET /deals/{id}, PATCH logging, fase_prev reopen, closed-deal webhook guard, notes/activities on deal,
person delete cascades deals). Run: pytest tests/test_deal_detail.py -n 0"""
import uuid
from datetime import date, timedelta
import pytest
import requests

U = uuid.uuid4().hex[:8]
S = {}


@pytest.fixture(scope="module", autouse=True)
def setup(admin, luca, base):
    p = luca.post(f"{base}/persons", json={"nome": "TEST_DealPg", "cognome": U, "email": f"test_dp_{U}@example.com", "force": True})
    assert p.status_code == 200, p.text
    S["pid"] = p.json()["id"]
    d = luca.post(f"{base}/deals", json={"titolo": f"TEST_DealPage_{U}", "valore": 500, "person_id": S["pid"]})
    assert d.status_code == 200
    S["did"] = d.json()["id"]
    yield
    admin.delete(f"{base}/persons/{S['pid']}")


# GET /deals/{id}
class TestGetDeal:
    def test_get_structure(self, luca, base):
        r = luca.get(f"{base}/deals/{S['did']}")
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("deal", "person", "org", "activities", "notes", "history", "products", "labels", "panoramica"):
            assert k in j
        assert j["deal"]["titolo"] == f"TEST_DealPage_{U}"
        assert j["person"]["id"] == S["pid"]
        assert j["labels"] == ["Molto probabile", "Probabile", "Ci pensa", "Poco probabile"]
        pan = j["panoramica"]
        assert pan["eta_giorni"] == 0 and pan["in_fase_giorni"] == 0 and pan["inactive_days"] == 0
        assert any("Affare creato" in h["text"] for h in j["history"])

    def test_404(self, luca, base):
        assert luca.get(f"{base}/deals/nonexistent-xyz").status_code == 404

    def test_401(self, base):
        assert requests.get(f"{base}/deals/{S['did']}").status_code == 401


# PATCH fields + history; fase_prev / reopen
class TestPatchDeal:
    def test_patch_fields_logged(self, luca, base):
        dp = (date.today() + timedelta(days=30)).isoformat()
        r = luca.patch(f"{base}/deals/{S['did']}", json={"etichetta": "Probabile", "data_prevista": dp, "valore": 750, "prodotti": ["ex-1", "ex-2"]})
        assert r.status_code == 200
        assert r.json()["etichetta"] == "Probabile" and r.json()["valore"] == 750
        j = luca.get(f"{base}/deals/{S['did']}").json()
        assert j["deal"]["data_prevista"] == dp
        assert sorted(p["id"] for p in j["products"]) == ["ex-1", "ex-2"]
        h = [x for x in j["history"] if x["text"].startswith("Affare modificato")]
        assert h and all(x["deal_id"] == S["did"] for x in h)
        for k in ("etichetta", "data_prevista", "valore", "prodotti"):
            assert k in h[0]["text"]
        # no-change patch shouldn't log again
        n = len(h)
        luca.patch(f"{base}/deals/{S['did']}", json={"etichetta": "Probabile"})
        j2 = luca.get(f"{base}/deals/{S['did']}").json()
        assert len([x for x in j2["history"] if x["text"].startswith("Affare modificato")]) == n

    def test_close_and_reopen(self, luca, base):
        did = S["did"]
        assert luca.patch(f"{base}/deals/{did}", json={"fase": "Proposta inviata"}).json()["fase"] == "Proposta inviata"
        w = luca.patch(f"{base}/deals/{did}", json={"fase": "Aggiudicato"}).json()
        assert w["status"] == "won" and w["fase_prev"] == "Proposta inviata" and w.get("closed_at")
        # switching won->lost keeps fase_prev
        l = luca.patch(f"{base}/deals/{did}", json={"fase": "Perso"}).json()
        assert l["status"] == "lost" and l["fase_prev"] == "Proposta inviata"
        ro = luca.patch(f"{base}/deals/{did}", json={"fase": l["fase_prev"]}).json()
        assert ro["status"] == "open" and ro["fase"] == "Proposta inviata"
        hist = luca.get(f"{base}/deals/{did}").json()["history"]
        assert any(x["kind"] == "stage" and "Aggiudicato" in x["text"] for x in hist)


# Webhook closed-deal guard
class TestWebhookClosed:
    def test_regress_ignored(self, luca, base, secrets):
        h = {"X-Webhook-Secret": secrets["webhook_secret"]}
        did = S["did"]
        luca.patch(f"{base}/deals/{did}", json={"fase": "Aggiudicato"})
        for ev in ("proposta_inviata", "remind_inviato"):
            r = requests.post(f"{base}/webhooks/contratti", headers=h, json={"event": ev, "crm_deal_id": did})
            assert r.status_code == 200 and r.json().get("ignored"), r.text
        assert luca.get(f"{base}/deals/{did}").json()["deal"]["fase"] == "Aggiudicato"
        r = requests.post(f"{base}/webhooks/contratti", headers=h, json={"event": "perso", "crm_deal_id": did, "motivo": "Test"})
        assert r.json()["fase"] == "Perso"
        luca.patch(f"{base}/deals/{did}", json={"fase": "Contatto chiamato"})


# Notes / activities on deal
class TestDealNotesActivities:
    def test_note_on_deal(self, luca, base):
        r = luca.post(f"{base}/notes", json={"content": f"TEST_note_{U}", "deal_id": S["did"], "person_id": S["pid"]})
        assert r.status_code == 200, r.text
        assert any(n["content"] == f"TEST_note_{U}" for n in luca.get(f"{base}/deals/{S['did']}").json()["notes"])
        assert any(n["content"] == f"TEST_note_{U}" for n in luca.get(f"{base}/persons/{S['pid']}").json()["notes"])

    def test_activity_on_deal(self, luca, base):
        r = luca.post(f"{base}/activities", json={"tipo": "chiamata", "oggetto": f"TEST_act_{U}", "data": (date.today() + timedelta(days=1)).isoformat(),
                                                   "ora": "10:00", "person_id": S["pid"], "deal_id": S["did"]})
        assert r.status_code == 200, r.text
        acts = luca.get(f"{base}/deals/{S['did']}").json()["activities"]
        assert any(a.get("oggetto") == f"TEST_act_{U}" and not a["done"] for a in acts)


# Person delete cascades deals
class TestPersonDeleteCascade:
    def test_cascade(self, admin, luca, base):
        p = luca.post(f"{base}/persons", json={"nome": "TEST_Casc", "cognome": U, "force": True}).json()
        d = luca.post(f"{base}/deals", json={"titolo": f"TEST_Casc_{U}", "person_id": p["id"]}).json()
        assert admin.delete(f"{base}/persons/{p['id']}").status_code == 200
        assert luca.get(f"{base}/deals/{d['id']}").status_code == 404
