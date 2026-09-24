from __future__ import annotations

from backend.app import models


def _signup(client, email, password="password123", name="User"):
    r = client.post("/api/auth/signup", json={"email": email, "password": password, "display_name": name})
    assert r.status_code == 201
    return r.json()


def test_forgot_password_returns_generic_message_regardless_of_email_existence(client):
    r_known = client.post("/api/auth/forgot-password", json={"email": "nonexistent@example.com"})
    assert r_known.status_code == 200
    assert "dev_reset_token" not in r_known.json() or r_known.json()["dev_reset_token"] is None

    _signup(client, "known@example.com")
    r_real = client.post("/api/auth/forgot-password", json={"email": "known@example.com"})
    assert r_real.status_code == 200
    assert r_real.json()["message"] == r_known.json()["message"]


def test_forgot_password_returns_dev_token_for_a_real_account(client):
    _signup(client, "reset1@example.com")
    r = client.post("/api/auth/forgot-password", json={"email": "reset1@example.com"})
    assert r.status_code == 200
    assert r.json()["dev_reset_token"] is not None


def test_full_reset_flow_changes_password_and_allows_login(client):
    _signup(client, "reset2@example.com", password="OldPassword1")
    client.post("/api/auth/logout")

    r_forgot = client.post("/api/auth/forgot-password", json={"email": "reset2@example.com"})
    token = r_forgot.json()["dev_reset_token"]

    r_reset = client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewPassword2"})
    assert r_reset.status_code == 204

    r_old_login = client.post("/api/auth/login", json={"email": "reset2@example.com", "password": "OldPassword1"})
    assert r_old_login.status_code == 401

    r_new_login = client.post("/api/auth/login", json={"email": "reset2@example.com", "password": "NewPassword2"})
    assert r_new_login.status_code == 200


def test_reset_token_is_single_use(client):
    _signup(client, "reset3@example.com")
    token = client.post("/api/auth/forgot-password", json={"email": "reset3@example.com"}).json()["dev_reset_token"]

    r1 = client.post("/api/auth/reset-password", json={"token": token, "new_password": "FirstNewPass1"})
    assert r1.status_code == 204

    r2 = client.post("/api/auth/reset-password", json={"token": token, "new_password": "SecondNewPass1"})
    assert r2.status_code == 400


def test_invalid_reset_token_is_rejected(client):
    r = client.post("/api/auth/reset-password", json={"token": "not-a-real-token", "new_password": "Whatever123"})
    assert r.status_code == 400


def test_requesting_a_new_reset_invalidates_the_previous_one(client):
    _signup(client, "reset4@example.com")
    token1 = client.post("/api/auth/forgot-password", json={"email": "reset4@example.com"}).json()["dev_reset_token"]
    token2 = client.post("/api/auth/forgot-password", json={"email": "reset4@example.com"}).json()["dev_reset_token"]
    assert token1 != token2

    r_old = client.post("/api/auth/reset-password", json={"token": token1, "new_password": "AttemptOld123"})
    assert r_old.status_code == 400

    r_new = client.post("/api/auth/reset-password", json={"token": token2, "new_password": "AttemptNew123"})
    assert r_new.status_code == 204


def test_reset_password_logs_out_every_existing_session(client):
    _signup(client, "reset5@example.com", password="StartPass1")
    assert client.get("/api/auth/me").status_code == 200  # session from signup is live

    token = client.post("/api/auth/forgot-password", json={"email": "reset5@example.com"}).json()["dev_reset_token"]
    client.post("/api/auth/reset-password", json={"token": token, "new_password": "FreshPass123"})

    # The original session (still in the test client's cookie jar) must now be dead.
    assert client.get("/api/auth/me").status_code == 401


def test_change_password_requires_current_password(client):
    _signup(client, "change1@example.com", password="Correct123")
    r = client.post("/api/auth/change-password", json={"current_password": "WrongCurrent", "new_password": "NewOne123"})
    assert r.status_code == 400


def test_change_password_succeeds_and_new_password_works(client):
    _signup(client, "change2@example.com", password="Correct123")
    r = client.post("/api/auth/change-password", json={"current_password": "Correct123", "new_password": "Updated456"})
    assert r.status_code == 204

    client.post("/api/auth/logout")
    r_login = client.post("/api/auth/login", json={"email": "change2@example.com", "password": "Updated456"})
    assert r_login.status_code == 200


def test_change_password_keeps_current_session_but_revokes_others(client, db_sessionmaker):
    me = _signup(client, "change3@example.com", password="Correct123")
    user_id = me["user"]["id"]

    with db_sessionmaker() as db:
        # Simulate a second, separate logged-in session for the same user (e.g. another device).
        import secrets as _secrets
        import datetime as _dt

        other_token = _secrets.token_urlsafe(32)
        db.add(models.Session(token=other_token, user_id=user_id, expires_at=_dt.datetime.utcnow() + _dt.timedelta(hours=1)))
        db.commit()

    r = client.post("/api/auth/change-password", json={"current_password": "Correct123", "new_password": "Updated789"})
    assert r.status_code == 204

    # This client's own session (the one that made the request) is still valid.
    assert client.get("/api/auth/me").status_code == 200

    with db_sessionmaker() as db:
        remaining = db.get(models.Session, other_token)
    assert remaining is None  # the other device's session was revoked


def test_password_reset_actions_are_audited(client, db_sessionmaker):
    _signup(client, "audit-reset@example.com", password="Correct123")
    token = client.post("/api/auth/forgot-password", json={"email": "audit-reset@example.com"}).json()["dev_reset_token"]
    client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewPass123"})

    with db_sessionmaker() as db:
        actions = {
            row.action
            for row in db.query(models.AuditLog).all()
            if row.action in ("PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_COMPLETED")
        }
    assert {"PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_COMPLETED"} <= actions


def test_update_profile_changes_display_name(client):
    _signup(client, "profile1@example.com", name="Old Name")
    r = client.patch("/api/auth/profile", json={"display_name": "New Name"})
    assert r.status_code == 200
    assert r.json()["user"]["display_name"] == "New Name"

    r_me = client.get("/api/auth/me")
    assert r_me.json()["user"]["display_name"] == "New Name"
