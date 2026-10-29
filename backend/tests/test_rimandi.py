# Rimando naming chain + GET /api/activities/{id}/storico + note_at
import datetime
import uuid
import pytest

TODAY = datetime.date.today()


@pytest.fixture(scope="module")
def chain(admin, base):
    u = uuid.uuid4().hex[:6]
    p = admin.post(f"{base}/persons", json={"nome": "TEST_Rim", "cognome": u, "email": f"test_rim_{u}@example.com", "force": True}).json()
    root = admin.post(f"{base}/activities", json={"tipo": "chiamata", "oggetto": "x cam", "data": TODAY.isoformat(), "ora": "10:30", "person_id": p["id"]}).json()
    ids = [root["id"]]
    prev = root
    for n in (1, 2, 3):
        r = admin.patch(f"{base}/activities/{prev['id']}", json={"note": f"fb {n}", "done": True})
        assert r.status_code == 200
        base_name = prev.get("oggetto_base") or prev["oggetto"]
        body = {"tipo": "richiamo", "oggetto": f"{'Rimando' if n == 1 else f'Rimando {n}'} - {base_name}", "oggetto_base": base_name,
                "rimando_n": n, "rimando_di": prev["id"], "catena_id": prev.get("catena_id") or prev["id"],
                "data": (TODAY + datetime.timedelta(days=n)).isoformat(), "ora": "11:15", "person_id": p["id"]}
        prev = admin.post(f"{base}/activities", json=body).json()
        ids.append(prev["id"])
    yield {"pid": p["id"], "ids": ids}
    for i in ids:
        admin.delete(f"{base}/activities/{i}")
    admin.delete(f"{base}/persons/{p['id']}")


def test_note_at_and_done_at(admin, base, chain):
    r = admin.get(f"{base}/activities/{chain['ids'][0]}/storico").json()
    first = r[0]
    assert first["note"] == "fb 1" and first["note_at"] and first["done_at"] and first["done"] is True


def test_rimando_fields_persisted(admin, base, chain):
    items = admin.get(f"{base}/activities/{chain['ids'][3]}/storico").json()
    assert [x["oggetto"] for x in items] == ["x cam", "Rimando - x cam", "Rimando 2 - x cam", "Rimando 3 - x cam"]
    assert items[-1]["rimando_n"] == 3 and items[-1]["ora"] == "11:15" and items[-1]["done"] is False
    assert all(x["catena_id"] == chain["ids"][0] for x in items[1:])


@pytest.mark.parametrize("idx", [0, 1, 2, 3])
def test_storico_full_chain_from_any_node(admin, base, chain, idx):
    r = admin.get(f"{base}/activities/{chain['ids'][idx]}/storico")
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == chain["ids"]
    assert all("_id" not in x for x in r.json())


def test_storico_404(admin, base):
    assert admin.get(f"{base}/activities/nope-{uuid.uuid4().hex}/storico").status_code == 404


def test_storico_unauth(base):
    import requests
    assert requests.get(f"{base}/activities/x/storico").status_code in (401, 403)


def test_storico_single_activity(admin, base, chain):
    a = admin.post(f"{base}/activities", json={"tipo": "chiamata", "oggetto": "TEST_single", "data": TODAY.isoformat(), "person_id": chain["pid"]}).json()
    r = admin.get(f"{base}/activities/{a['id']}/storico").json()
    admin.delete(f"{base}/activities/{a['id']}")
    assert [x["id"] for x in r] == [a["id"]]
