"""Affare = proposta: POST /api/contratti/proposte without deal_id creates or reuses the contact's deal (mock contratti mode).
Run: pytest tests/test_affare_proposta.py -p no:xdist -o addopts='' (after python tests/make_test_users.py)"""
import uuid
import pytest
import requests

U = uuid.uuid4().hex[:8]
CREATED = []
SCAD = "2030-06-01"


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin, base):
    yield
    for pid in CREATED:
        admin.delete(f"{base}/persons/{pid}")


def _person(luca, base, tag):
    r = luca.post(f"{base}/persons", json={"nome": f"TEST_Aff{tag}", "cognome": U, "email": f"aff{tag}_{U}@example.com", "force": True})
    assert r.status_code == 200, r.text
    CREATED.append(r.json()["id"])
    return r.json()["id"]


def _deals(luca, base, pid):
    return luca.get(f"{base}/persons/{pid}").json()["deals"]


def _names(luca, base, ids):
    prods = {p["id"]: p["nome"] for p in luca.get(f"{base}/products").json()["items"]}
    return " + ".join(prods[i] for i in ids)


# New deal created from proposal on contact without deals
class TestCreateDealFromProposal:
    def test_anteprima_with_person_only(self, luca, base):
        pid = _person(luca, base, "A")
        r = luca.post(f"{base}/contratti/anteprima", json={"person_id": pid, "righe": [{"prodotto_id": "ex-1"}], "scadenza": SCAD})
        assert r.status_code == 200, r.text
        assert r.json()["cliente"]["email"] == f"affA_{U}@example.com"
        assert _deals(luca, base, pid) == []  # anteprima doesn't create deal
        pytest.aff_pid = pid

    def test_anteprima_without_contact_400(self, luca, base):
        r = luca.post(f"{base}/contratti/anteprima", json={"righe": [{"prodotto_id": "ex-1"}], "scadenza": SCAD})
        assert r.status_code == 400 and "contatto" in r.json()["detail"].lower()

    def test_create_send_creates_deal(self, luca, base):
        pid = pytest.aff_pid
        r = luca.post(f"{base}/contratti/proposte", json={"person_id": pid, "righe": [{"prodotto_id": "ex-1"}, {"prodotto_id": "ex-2"}],
                                                          "scadenza": SCAD, "invia": True})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["crm_deal_id"] and p["stato"] == "inviata" and p["crm_person_id"] == pid
        deals = _deals(luca, base, pid)
        assert len(deals) == 1
        d = deals[0]
        assert d["id"] == p["crm_deal_id"]
        assert d["titolo"] == _names(luca, base, ["ex-1", "ex-2"])
        assert d["fase"] == "Proposta inviata"
        assert p["id"] in d["proposte"] and d["valore"] == p["totale"]
        lst = luca.get(f"{base}/contratti/proposte", params={"deal_id": d["id"]}).json()
        assert [x["id"] for x in lst] == [p["id"]]
        pytest.aff_deal = d["id"]

    def test_second_proposal_creates_new_deal(self, luca, base):
        # existing deal has a proposal -> not reused
        pid = pytest.aff_pid
        r = luca.post(f"{base}/contratti/proposte", json={"person_id": pid, "righe": [{"prodotto_id": "ex-3"}], "scadenza": SCAD})
        assert r.status_code == 200
        assert r.json()["crm_deal_id"] != pytest.aff_deal
        deals = _deals(luca, base, pid)
        assert len(deals) == 2
        nd = next(x for x in deals if x["id"] == r.json()["crm_deal_id"])
        assert nd["fase"] == "Contatto chiamato"  # draft only

    def test_existing_deal_regression(self, luca, base):
        # deal_id given -> proposal added to THAT deal, no new deal
        pid = pytest.aff_pid
        before = len(_deals(luca, base, pid))
        r = luca.post(f"{base}/contratti/proposte", json={"deal_id": pytest.aff_deal, "righe": [{"prodotto_id": "ex-4"}], "scadenza": SCAD})
        assert r.status_code == 200 and r.json()["crm_deal_id"] == pytest.aff_deal
        assert len(_deals(luca, base, pid)) == before
        lst = luca.get(f"{base}/contratti/proposte", params={"deal_id": pytest.aff_deal}).json()
        assert len(lst) == 2


# Lead webhook deal ('Contatto ricevuto', no proposals) is reused
class TestReuseLeadDeal:
    def test_reuse(self, luca, base, secrets):
        h = {"X-Leads-Secret": secrets["leads_secret"]}
        r = requests.post(f"{base}/webhooks/leads", headers=h, json={"nome": "TEST_AffLead", "cognome": U, "email": f"afflead_{U}@example.com",
                                                                     "telefono": f"348{abs(hash(U)) % 10**7:07d}", "prodotto_richiesto": "TEST_Corso", "fonte": "Sito"})
        assert r.status_code == 200, r.text
        pid = r.json()["person_id"]; CREATED.append(pid)
        deals = _deals(luca, base, pid)
        assert len(deals) == 1 and deals[0]["fase"] == "Contatto ricevuto"
        lead_deal = deals[0]["id"]
        c = luca.post(f"{base}/contratti/proposte", json={"person_id": pid, "righe": [{"prodotto_id": "ex-5"}], "scadenza": SCAD, "invia": True})
        assert c.status_code == 200, c.text
        assert c.json()["crm_deal_id"] == lead_deal
        deals = _deals(luca, base, pid)
        assert len(deals) == 1
        assert deals[0]["titolo"] == _names(luca, base, ["ex-5"])
        assert deals[0]["fase"] == "Proposta inviata"
        assert c.json()["id"] in deals[0]["proposte"]

    def test_lost_deal_not_reused(self, luca, base):
        pid = _person(luca, base, "L")
        d = luca.post(f"{base}/deals", json={"titolo": f"TEST_Lost_{U}", "person_id": pid}).json()
        luca.patch(f"{base}/deals/{d['id']}", json={"status": "lost"})
        st = next(x for x in _deals(luca, base, pid) if x["id"] == d["id"])["status"]
        c = luca.post(f"{base}/contratti/proposte", json={"person_id": pid, "righe": [{"prodotto_id": "ex-1"}], "scadenza": SCAD})
        assert c.status_code == 200
        if st == "lost":
            assert c.json()["crm_deal_id"] != d["id"]
        else:
            assert c.json()["crm_deal_id"] == d["id"]


# Validation
class TestValidation:
    def test_no_contact(self, luca, base):
        r = luca.post(f"{base}/contratti/proposte", json={"righe": [{"prodotto_id": "ex-1"}], "scadenza": SCAD})
        assert r.status_code == 400

    def test_no_products_no_deal_created(self, luca, base):
        pid = _person(luca, base, "V")
        r = luca.post(f"{base}/contratti/proposte", json={"person_id": pid, "righe": [], "scadenza": SCAD})
        assert r.status_code == 400
        assert _deals(luca, base, pid) == []

    def test_unauth(self, base):
        assert requests.post(f"{base}/contratti/proposte", json={}).status_code == 401
