import os, json, sys, urllib.request
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
uid = json.load(open("/tmp/tokens.json"))[sys.argv[1] if len(sys.argv) > 1 else "Angelo"]["id"]
req = urllib.request.Request("https://api.clerk.com/v1/sign_in_tokens", data=json.dumps({"user_id": uid, "expires_in_seconds": 3600}).encode(),
                             method="POST", headers={"Authorization": "Bearer " + os.environ["CLERK_SECRET_KEY"], "Content-Type": "application/json", "User-Agent": "emergent-test"})
print(json.load(urllib.request.urlopen(req))["token"])
