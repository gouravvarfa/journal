from __future__ import annotations

from sqlalchemy import select

from backend.app import models


def _signup(client, email="a@example.com", password="password123", name="User A"):
    return client.post("/api/auth/signup", json={"email": email, "password": password, "display_name": name})


def test_signup_creates_user_and_owner_workspace(client):
    r = _signup(client)
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "a@example.com"
    assert len(body["workspaces"]) == 1
    assert body["workspaces"][0]["role"] == "OWNER"
    assert body["workspaces"][0]["name"] == "User A's Workspace"


def test_duplicate_signup_email_rejected(client):
    _signup(client, email="dup@example.com")
    r = _signup(client, email="dup@example.com")
    assert r.status_code == 409


def test_me_requires_authentication(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_unauthenticated_request_to_protected_workspace_route_fails(client):
    r = client.get("/api/workspaces")
    assert r.status_code == 401


def test_login_then_me_works(client):
    _signup(client, email="b@example.com")
    client.post("/api/auth/logout")

    r = client.post("/api/auth/login", json={"email": "b@example.com", "password": "password123"})
    assert r.status_code == 200

    r2 = client.get("/api/auth/me")
    assert r2.status_code == 200
    assert r2.json()["user"]["email"] == "b@example.com"


def test_wrong_password_fails(client):
    _signup(client, email="c@example.com")
    client.post("/api/auth/logout")

    r = client.post("/api/auth/login", json={"email": "c@example.com", "password": "WRONG-PASSWORD"})
    assert r.status_code == 401


def test_login_with_unknown_email_fails(client):
    r = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "password123"})
    assert r.status_code == 401


def test_logout_invalidates_session(client):
    _signup(client, email="d@example.com")
    assert client.get("/api/auth/me").status_code == 200

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_password_never_stored_as_plaintext(client, db_sessionmaker):
    plaintext = "SuperSecret1"
    r = _signup(client, email="e@example.com", password=plaintext)
    assert r.status_code == 201
    assert plaintext not in r.text  # never echoed back in the API response

    db = db_sessionmaker()
    try:
        user = db.scalar(select(models.User).where(models.User.email == "e@example.com"))
        assert user is not None
        assert user.password_hash != plaintext
        assert plaintext not in user.password_hash
        assert user.password_hash.startswith("$2b$")  # bcrypt hash prefix
    finally:
        db.close()
