import json, sys, requests, uuid
base = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0] + "/api"
tok = json.load(open("/tmp/tokens.json"))["Angelo"]["token"]
s = requests.get(f"{base}/admin/integrations", headers={"Authorization": f"Bearer {tok}"}).json()
u = uuid.uuid4().hex[:6]
r = requests.post(f"{base}/webhooks/leads", headers={"X-Leads-Secret": s["leads_secret"]},
                  json={"nome": "TEST_UiLead", "cognome": u, "email": f"uilead_{u}@example.com", "telefono": f"347{abs(hash(u)) % 10**7:07d}",
                        "prodotto_richiesto": "Corso Carbon Farming", "fonte": "Facebook"})
print(json.dumps(r.json()))
