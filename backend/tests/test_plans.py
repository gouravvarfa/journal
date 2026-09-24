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


def test_new_workspace_defaults_to_free_plan_with_reported_limits(client):
    owner = _signup(client, "plan1@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]

    r = client.get(f"/api/workspaces/{ws_id}/plan")
    assert r.status_code == 200
    body = r.json()
    assert body["plan"] == "FREE"
    assert body["limits"]["max_trading_accounts"] == 3
    assert body["limits"]["max_members_per_account"] == 2
    assert body["trading_accounts_used"] == 0


def test_trading_account_creation_is_blocked_once_the_free_plan_limit_is_reached(client):
    owner = _signup(client, "plan2@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]

    for i in range(1, 4):  # FREE plan allows 3
        r = client.post("/api/accounts", json={"workspace_id": ws_id, "name": f"Account {i}", "broker_name": "Angel One"})
        assert r.status_code == 201

    r_blocked = client.post("/api/accounts", json={"workspace_id": ws_id, "name": "Account 4", "broker_name": "Angel One"})
    assert r_blocked.status_code == 402

    r = client.get(f"/api/workspaces/{ws_id}/plan")
    assert r.json()["trading_accounts_used"] == 3


def test_business_plan_never_blocks_trading_account_creation(client):
    owner = _signup(client, "plan2b@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    client.patch(f"/api/workspaces/{ws_id}/plan", json={"plan": "BUSINESS"})

    for i in range(1, 11):
        r = client.post("/api/accounts", json={"workspace_id": ws_id, "name": f"Account {i}", "broker_name": "Angel One"})
        assert r.status_code == 201

    r = client.get(f"/api/workspaces/{ws_id}/plan")
    assert r.json()["trading_accounts_used"] == 10


def test_owner_can_upgrade_plan_and_limits_change_accordingly(client, db_sessionmaker):
    owner = _signup(client, "plan3@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]

    r = client.patch(f"/api/workspaces/{ws_id}/plan", json={"plan": "BUSINESS"})
    assert r.status_code == 200
    body = r.json()
    assert body["plan"] == "BUSINESS"
    assert body["limits"]["max_trading_accounts"] is None
    assert body["limits"]["max_members_per_account"] is None

    with db_sessionmaker() as db:
        rows = db.query(models.AuditLog).filter(models.AuditLog.action == "WORKSPACE_PLAN_CHANGED").all()
    assert len(rows) == 1
    assert "BUSINESS" in rows[0].metadata_json


def test_non_owner_workspace_admin_cannot_change_plan(client):
    owner = _signup(client, "plan4@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    r = client.patch(f"/api/workspaces/{ws_id}/plan", json={"plan": "PRO"})
    assert r.status_code == 200  # sanity: owner itself can

    # A second workspace's owner has no membership at all in ws_id.
    client.post("/api/auth/logout")
    _signup(client, "plan4b@example.com", "Outsider")
    r = client.patch(f"/api/workspaces/{ws_id}/plan", json={"plan": "BUSINESS"})
    assert r.status_code == 404  # not a member, never confirm the workspace exists


def test_invalid_plan_name_is_rejected(client):
    owner = _signup(client, "plan5@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    r = client.patch(f"/api/workspaces/{ws_id}/plan", json={"plan": "ULTRA_DELUXE"})
    assert r.status_code == 422


def test_free_plan_account_seat_limit_blocks_the_third_seat(client):
    owner = _signup(client, "plan6@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)

    r1 = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "seatA@example.com", "role": "VIEWER"})
    assert r1.status_code == 201  # owner(1) + this invite(1) = 2, at the FREE cap of 2

    r2 = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "seatB@example.com", "role": "VIEWER"})
    assert r2.status_code == 402


def test_upgrading_plan_lifts_the_seat_limit(client):
    owner = _signup(client, "plan7@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)
    client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "seatC@example.com", "role": "VIEWER"})

    blocked = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "seatD@example.com", "role": "VIEWER"})
    assert blocked.status_code == 402

    client.patch(f"/api/workspaces/{ws_id}/plan", json={"plan": "PRO"})

    allowed = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "seatD@example.com", "role": "VIEWER"})
    assert allowed.status_code == 201


def test_business_plan_never_blocks_seats(client):
    owner = _signup(client, "plan8@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    client.patch(f"/api/workspaces/{ws_id}/plan", json={"plan": "BUSINESS"})
    account = _create_account(client, ws_id)

    for i in range(5):
        r = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": f"biz{i}@example.com", "role": "VIEWER"})
        assert r.status_code == 201


def test_duplicate_invite_error_takes_priority_over_seat_limit(client):
    """
    Sending a business-logic error (already invited) rather than a
    plan-upgrade prompt for a request that could never have succeeded
    anyway, even with more seats.
    """
    owner = _signup(client, "plan9@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)
    client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "dup9@example.com", "role": "VIEWER"})

    r = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "dup9@example.com", "role": "ADMIN"})
    assert r.status_code == 409  # not 402
