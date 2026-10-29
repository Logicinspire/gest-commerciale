import os, json, urllib.request, asyncio
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]


def bapi(path, body=None, method="POST"):
    req = urllib.request.Request("https://api.clerk.com/v1" + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "emergent-test"})
    return json.load(urllib.request.urlopen(req))


USERS = [("angelo+clerk_test@italiacorsi.it", "Angelo", "admin"), ("luca+clerk_test@italiacorsi.it", "Luca", "commerciale"),
         ("carla+clerk_test@italiacorsi.it", "Carla", "commerciale"), ("nuovo+clerk_test@italiacorsi.it", "Nuovo", "in_attesa")]


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    out = {}
    for email, name, role in USERS:
        found = bapi(f"/users?email_address={urllib.parse.quote(email)}", None, "GET")
        u = found[0] if found else bapi("/users", {"email_address": [email], "password": "Test-pass-12345!", "first_name": name, "skip_password_checks": True})
        await db.users.update_one({"user_id": u["id"]}, {"$set": {"user_id": u["id"], "role": role, "name": name, "email": email, "env": "preview"}}, upsert=True)
        s = bapi("/sessions", {"user_id": u["id"]})
        out[name] = {"id": u["id"], "token": bapi(f"/sessions/{s['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]}
    json.dump(out, open("/tmp/tokens.json", "w"))
    print({k: v["id"] for k, v in out.items()})

import urllib.parse
asyncio.run(main())
