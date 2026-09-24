from __future__ import annotations

from backend.app import models


def _signup(client, email, name):
    r = client.post("/api/auth/signup", json={"email": email, "password": "password123", "display_name": name})
    assert r.status_code == 201
    return r.json()


def _create_account(client, workspace_id, name="A1"):
    r = client.post("/api/accounts", json={"workspace_id": workspace_id, "name": name, "broker_name": "Angel One"})
    assert r.status_code == 201
    return r.json()


CREDS = {
    "broker_name": "Angel One",
    "api_key": "super-secret-api-key",
    "client_code": "A123456",
    "pin": "1234",
    "totp_secret": "JBSWY3DPEHPK3PXP",
}


def _invite_and_accept(client, account_id, email, role):
    r = client.post(f"/api/accounts/{account_id}/invitations", json={"email": email, "role": role})
    invitation_id = r.json()["id"]
    client.post("/api/auth/logout")
    _signup(client, email, f"{role} person")
    client.post(f"/api/invitations/{invitation_id}/accept")


def test_owner_can_save_and_reveal_broker_credentials(client):
    owner = _signup(client, "broker1@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])

    r = client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)
    assert r.status_code == 201
    assert r.json()["is_connected"] is True
    assert r.json()["masked_client_code"] == "***3456"

    r = client.get(f"/api/accounts/{account['id']}/broker-credentials/reveal")
    assert r.status_code == 200
    body = r.json()
    assert body["api_key"] == CREDS["api_key"]
    assert body["client_code"] == CREDS["client_code"]
    assert body["pin"] == CREDS["pin"]
    assert body["totp_secret"] == CREDS["totp_secret"]


def test_credentials_are_encrypted_at_rest_in_the_database(client, db_sessionmaker):
    owner = _signup(client, "broker2@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)

    with db_sessionmaker() as db:
        row = db.query(models.BrokerConnection).filter(
            models.BrokerConnection.trading_account_id == account["id"]
        ).one()
        assert CREDS["api_key"] not in row.encrypted_api_key
        assert CREDS["client_code"] not in row.encrypted_client_code
        assert CREDS["pin"] not in row.encrypted_pin
        assert CREDS["totp_secret"] not in row.encrypted_totp_secret
        assert row.encrypted_api_key != CREDS["api_key"]


def test_status_endpoint_never_returns_secrets(client):
    owner = _signup(client, "broker3@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)

    r = client.get(f"/api/accounts/{account['id']}/broker-status")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"is_connected", "broker_name", "masked_client_code", "updated_at"}
    assert body["masked_client_code"] == "***3456"
    for secret in (CREDS["api_key"], CREDS["client_code"], CREDS["pin"], CREDS["totp_secret"]):
        assert secret not in str(body)


def test_viewer_cannot_reveal_or_save_or_delete_broker_credentials(client):
    owner = _signup(client, "broker4@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)
    _invite_and_accept(client, account["id"], "viewer4@example.com", "VIEWER")

    r = client.get(f"/api/accounts/{account['id']}/broker-credentials/reveal")
    assert r.status_code == 403

    r = client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)
    assert r.status_code == 403

    r = client.delete(f"/api/accounts/{account['id']}/broker-credentials")
    assert r.status_code == 403


def test_viewer_can_still_see_masked_status(client):
    owner = _signup(client, "broker5@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)
    _invite_and_accept(client, account["id"], "viewer5@example.com", "VIEWER")

    r = client.get(f"/api/accounts/{account['id']}/broker-status")
    assert r.status_code == 200
    assert r.json()["is_connected"] is True
    assert r.json()["masked_client_code"] == "***3456"


def test_admin_can_manage_broker_credentials_but_viewer_cannot(client):
    owner = _signup(client, "broker6@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    _invite_and_accept(client, account["id"], "admin6@example.com", "ADMIN")

    r = client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)
    assert r.status_code == 201
    r = client.get(f"/api/accounts/{account['id']}/broker-credentials/reveal")
    assert r.status_code == 200


def test_reveal_is_audited(client, db_sessionmaker):
    owner = _signup(client, "broker7@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)
    client.get(f"/api/accounts/{account['id']}/broker-credentials/reveal")

    with db_sessionmaker() as db:
        rows = db.query(models.AuditLog).filter(models.AuditLog.action == "BROKER_CREDENTIALS_REVEALED").all()
    assert len(rows) == 1
    assert CREDS["api_key"] not in (rows[0].metadata_json or "")


def test_save_and_delete_are_audited_and_never_log_plaintext(client, db_sessionmaker):
    owner = _signup(client, "broker8@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)
    client.delete(f"/api/accounts/{account['id']}/broker-credentials")

    with db_sessionmaker() as db:
        rows = db.query(models.AuditLog).filter(
            models.AuditLog.action.in_(["BROKER_CREDENTIALS_SAVED", "BROKER_CREDENTIALS_DELETED"])
        ).all()
        actions = [r.action for r in rows]
        for r in rows:
            for secret in (CREDS["api_key"], CREDS["client_code"], CREDS["pin"], CREDS["totp_secret"]):
                assert secret not in (r.metadata_json or "")

    assert "BROKER_CREDENTIALS_SAVED" in actions
    assert "BROKER_CREDENTIALS_DELETED" in actions


def test_reveal_without_any_saved_credentials_returns_404(client):
    owner = _signup(client, "broker9@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])

    r = client.get(f"/api/accounts/{account['id']}/broker-credentials/reveal")
    assert r.status_code == 404


def test_deleting_account_cascades_broker_connection_cleanly(client, db_sessionmaker):
    owner = _signup(client, "broker10@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.put(f"/api/accounts/{account['id']}/broker-credentials", json=CREDS)

    r = client.delete(f"/api/accounts/{account['id']}")
    assert r.status_code == 204

    with db_sessionmaker() as db:
        remaining = db.query(models.BrokerConnection).filter(
            models.BrokerConnection.trading_account_id == account["id"]
        ).all()
    assert remaining == []


def test_cross_account_broker_access_is_denied(client):
    owner_a = _signup(client, "brokerA@example.com", "OwnerA")
    account_a = _create_account(client, owner_a["workspaces"][0]["id"], name="Account A")
    client.put(f"/api/accounts/{account_a['id']}/broker-credentials", json=CREDS)
    client.post("/api/auth/logout")

    owner_b = _signup(client, "brokerB@example.com", "OwnerB")
    account_b = _create_account(client, owner_b["workspaces"][0]["id"], name="Account B")

    r = client.get(f"/api/accounts/{account_a['id']}/broker-credentials/reveal")
    assert r.status_code == 404  # not even a member of account A

    r = client.get(f"/api/accounts/{account_a['id']}/broker-status")
    assert r.status_code == 404
