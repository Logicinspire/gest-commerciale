import json
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


@pytest.fixture(scope="session")
def base():
    return BASE_URL + "/api"


@pytest.fixture(scope="session")
def tokens():
    if not os.path.exists("/tmp/tokens.json"):
        pytest.skip("run tests/make_test_users.py first")
    return json.load(open("/tmp/tokens.json"))


def _client(tok):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin(tokens):
    return _client(tokens["Angelo"]["token"])


@pytest.fixture(scope="session")
def luca(tokens):
    return _client(tokens["Luca"]["token"])


@pytest.fixture(scope="session")
def carla(tokens):
    return _client(tokens["Carla"]["token"])


@pytest.fixture(scope="session")
def nuovo(tokens):
    return _client(tokens["Nuovo"]["token"])


@pytest.fixture(scope="session")
def secrets(admin, base):
    r = admin.get(f"{base}/admin/integrations")
    assert r.status_code == 200
    return r.json()
