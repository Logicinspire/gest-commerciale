"""Seed a TEST_ person + deal for UI testing of the deal page. Prints JSON {pid, did}."""
import json, uuid, requests
for line in open("/app/frontend/.env"):
    if line.startswith("REACT_APP_BACKEND_URL="):
        B = line.split("=", 1)[1].strip().rstrip("/") + "/api"
t = json.load(open("/tmp/tokens.json"))["Angelo"]["token"]
s = requests.Session(); s.headers["Authorization"] = f"Bearer {t}"
u = uuid.uuid4().hex[:6]
p = s.post(f"{B}/persons", json={"nome": "TEST_UI", "cognome": f"Deal{u}", "email": f"test_ui_{u}@example.com", "telefono": "+39 333 555 " + u[:4], "force": True}).json()
d = s.post(f"{B}/deals", json={"titolo": f"TEST_UIDeal_{u}", "valore": 300, "person_id": p["id"]}).json()
print(json.dumps({"pid": p["id"], "did": d["id"], "titolo": d["titolo"]}))
