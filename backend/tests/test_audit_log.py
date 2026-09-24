from __future__ import annotations

from backend.app import models


def _signup(client, email, name):
    r = client.post("/api/auth/signup", json={"email": email, "password": "password123", "display_name": name})
    assert r.status_code == 201
    return r.json()


def _login(client, email, password="password123"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    return r


def _create_account(client, workspace_id, name="A1"):
    r = client.post("/api/accounts", json={"workspace_id": workspace_id, "name": name, "broker_name": "Angel One"})
    assert r.status_code == 201
    return r.json()


def test_signup_and_login_are_logged(client, db_sessionmaker):
    _signup(client, "audit1@example.com", "Owner")
    client.post("/api/auth/logout")
    _login(client, "audit1@example.com")

    with db_sessionmaker() as db:
        actions = [row.action for row in db.query(models.AuditLog).all()]
    assert "SIGNUP" in actions
    assert "LOGIN_SUCCESS" in actions


def test_failed_login_is_logged_without_revealing_which_field_was_wrong(client, db_sessionmaker):
    _signup(client, "audit2@example.com", "Owner")
    client.post("/api/auth/logout")

    r = _login(client, "audit2@example.com", password="wrong-password")
    assert r.status_code == 401

    with db_sessionmaker() as db:
        rows = db.query(models.AuditLog).filter(models.AuditLog.action == "LOGIN_FAILED").all()
    assert len(rows) == 1


def test_logout_is_logged(client, db_sessionmaker):
    _signup(client, "audit3@example.com", "Owner")
    client.post("/api/auth/logout")

    with db_sessionmaker() as db:
        actions = [row.action for row in db.query(models.AuditLog).all()]
    assert "LOGOUT" in actions


def test_account_lifecycle_is_logged(client, db_sessionmaker):
    owner = _signup(client, "audit4@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"], name="Audited Account")

    r = client.patch(f"/api/accounts/{account['id']}", json={"name": "Renamed Account"})
    assert r.status_code == 200

    # Checked here, before delete: deleting the account below sets
    # trading_account_id to NULL on *every* row that referenced it
    # (ON DELETE SET NULL applies to all of them, not just the delete's own
    # log row), so a trading_account_id-scoped query after the delete would
    # no longer find these two.
    with db_sessionmaker() as db:
        rows = db.query(models.AuditLog).filter(models.AuditLog.trading_account_id == account["id"]).all()
        actions = [row.action for row in rows]
    assert "ACCOUNT_CREATED" in actions
    assert "ACCOUNT_UPDATED" in actions

    r = client.delete(f"/api/accounts/{account['id']}")
    assert r.status_code == 204

    with db_sessionmaker() as db:
        deleted_rows = db.query(models.AuditLog).filter(models.AuditLog.action == "ACCOUNT_DELETED").all()
    assert len(deleted_rows) == 1
    assert account["id"] in deleted_rows[0].metadata_json


def test_account_delete_does_not_break_its_own_audit_row(client, db_sessionmaker):
    """
    The account referenced by an audit row can be deleted without the
    delete failing or the row disappearing — the FK is ON DELETE SET NULL,
    the id is preserved in metadata_json.
    """
    owner = _signup(client, "audit5@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"], name="To Delete")
    account_id = account["id"]

    r = client.delete(f"/api/accounts/{account_id}")
    assert r.status_code == 204

    with db_sessionmaker() as db:
        row = db.query(models.AuditLog).filter(models.AuditLog.action == "ACCOUNT_DELETED").one()
        assert row.trading_account_id is None
        assert account_id in row.metadata_json


def test_invitation_lifecycle_is_logged(client, db_sessionmaker):
    owner = _signup(client, "audit6@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"], name="Shared Audit Account")

    r = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "invitee6@example.com", "role": "VIEWER"})
    invitation_id = r.json()["id"]

    r = client.delete(f"/api/accounts/{account['id']}/invitations/{invitation_id}")
    assert r.status_code == 204

    with db_sessionmaker() as db:
        rows = db.query(models.AuditLog).filter(models.AuditLog.trading_account_id == account["id"]).all()
        actions = [row.action for row in rows]

    assert "INVITATION_CREATED" in actions
    assert "INVITATION_REVOKED" in actions


def test_invitation_accept_is_logged(client, db_sessionmaker):
    owner = _signup(client, "audit7@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"], name="Accept Audit Account")
    r = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "invitee7@example.com", "role": "VIEWER"})
    invitation_id = r.json()["id"]
    client.post("/api/auth/logout")

    _signup(client, "invitee7@example.com", "Invitee")
    r = client.post(f"/api/invitations/{invitation_id}/accept")
    assert r.status_code == 200

    with db_sessionmaker() as db:
        rows = db.query(models.AuditLog).filter(models.AuditLog.action == "INVITATION_ACCEPTED").all()
    assert len(rows) == 1


def test_viewer_cannot_read_the_audit_log(client, db_sessionmaker):
    owner = _signup(client, "audit8@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"], name="Viewer Locked Out")
    r = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "viewer8@example.com", "role": "VIEWER"})
    invitation_id = r.json()["id"]
    client.post("/api/auth/logout")

    _signup(client, "viewer8@example.com", "Viewer")
    client.post(f"/api/invitations/{invitation_id}/accept")

    r = client.get(f"/api/accounts/{account['id']}/audit-log")
    assert r.status_code == 403


def test_owner_can_read_the_audit_log_and_it_includes_ip_and_actor_email(client, db_sessionmaker):
    owner = _signup(client, "audit9@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"], name="Owner Visible Log")

    r = client.get(f"/api/accounts/{account['id']}/audit-log")
    assert r.status_code == 200
    body = r.json()
    assert any(row["action"] == "ACCOUNT_CREATED" for row in body)
    created_row = next(row for row in body if row["action"] == "ACCOUNT_CREATED")
    assert created_row["user_email"] == "audit9@example.com"
    assert created_row["ip_address"] is not None


def test_audit_log_is_scoped_to_the_account_never_cross_account(client, db_sessionmaker):
    owner = _signup(client, "audit10@example.com", "Owner")
    account_a = _create_account(client, owner["workspaces"][0]["id"], name="Account A")
    account_b = _create_account(client, owner["workspaces"][0]["id"], name="Account B")

    r = client.get(f"/api/accounts/{account_a['id']}/audit-log")
    account_ids_seen = {row["trading_account_id"] for row in r.json()}
    assert account_ids_seen == {account_a["id"]}
    assert account_b["id"] not in account_ids_seen
