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


def _invite_and_accept(client, account_id, email, role):
    r = client.post(f"/api/accounts/{account_id}/invitations", json={"email": email, "role": role})
    invitation_id = r.json()["id"]
    client.post("/api/auth/logout")
    _signup(client, email, f"{role} person")
    client.post(f"/api/invitations/{invitation_id}/accept")


SAMPLE_TRADE = {
    "trade_date": "2026-01-05",
    "segment": "EQUITY",
    "script_name": "RELIANCE",
    "reason": "Breakout",
    "quantity": 10,
    "side": "BUY",
    "entry_price": 2500.0,
    "exit_date": "2026-01-06",
    "exit_price": 2550.0,
    "status": "CLOSED",
    "gross_pnl": 500.0,
    "net_pnl": 480.0,
    "notes": "Clean breakout, held overnight.",
}


def test_owner_can_create_list_update_delete_trade(client):
    owner = _signup(client, "trade1@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])

    r_create = client.post(f"/api/accounts/{account['id']}/trades", json=SAMPLE_TRADE)
    assert r_create.status_code == 201
    trade = r_create.json()
    assert trade["script_name"] == "RELIANCE"
    assert trade["trading_account_id"] == account["id"]

    r_list = client.get(f"/api/accounts/{account['id']}/trades")
    assert r_list.status_code == 200
    assert len(r_list.json()) == 1

    r_update = client.patch(f"/api/accounts/{account['id']}/trades/{trade['id']}", json={"notes": "Updated notes"})
    assert r_update.status_code == 200
    assert r_update.json()["notes"] == "Updated notes"

    r_delete = client.delete(f"/api/accounts/{account['id']}/trades/{trade['id']}")
    assert r_delete.status_code == 204
    assert client.get(f"/api/accounts/{account['id']}/trades").json() == []


def test_viewer_can_read_but_not_write_trades(client):
    owner = _signup(client, "trade2@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    r_create = client.post(f"/api/accounts/{account['id']}/trades", json=SAMPLE_TRADE)
    trade_id = r_create.json()["id"]

    _invite_and_accept(client, account["id"], "viewer2@example.com", "VIEWER")

    r_list = client.get(f"/api/accounts/{account['id']}/trades")
    assert r_list.status_code == 200
    assert len(r_list.json()) == 1

    assert client.post(f"/api/accounts/{account['id']}/trades", json=SAMPLE_TRADE).status_code == 403
    assert client.patch(f"/api/accounts/{account['id']}/trades/{trade_id}", json={"notes": "hack"}).status_code == 403
    assert client.delete(f"/api/accounts/{account['id']}/trades/{trade_id}").status_code == 403


def test_admin_can_write_trades(client):
    owner = _signup(client, "trade3@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    _invite_and_accept(client, account["id"], "admin3@example.com", "ADMIN")

    r = client.post(f"/api/accounts/{account['id']}/trades", json=SAMPLE_TRADE)
    assert r.status_code == 201


def test_cross_account_trade_access_is_denied(client):
    owner_a = _signup(client, "tradeA@example.com", "OwnerA")
    account_a = _create_account(client, owner_a["workspaces"][0]["id"], name="Account A")
    r = client.post(f"/api/accounts/{account_a['id']}/trades", json=SAMPLE_TRADE)
    trade_id = r.json()["id"]
    client.post("/api/auth/logout")

    _signup(client, "tradeB@example.com", "OwnerB")
    assert client.get(f"/api/accounts/{account_a['id']}/trades").status_code == 404
    assert client.post(f"/api/accounts/{account_a['id']}/trades", json=SAMPLE_TRADE).status_code == 404
    assert client.patch(f"/api/accounts/{account_a['id']}/trades/{trade_id}", json={"notes": "x"}).status_code == 404
    assert client.delete(f"/api/accounts/{account_a['id']}/trades/{trade_id}").status_code == 404


def test_shared_viewer_sees_owners_real_trades(client):
    """
    The exact scenario that originally surfaced this whole feature: a
    shared account must show the owner's real trade data, not an empty
    container.
    """
    owner = _signup(client, "trade4@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"], name="Shared Real Data")
    client.post(f"/api/accounts/{account['id']}/trades", json=SAMPLE_TRADE)
    client.post(f"/api/accounts/{account['id']}/trades", json={**SAMPLE_TRADE, "script_name": "TCS", "trade_date": "2026-01-07"})

    _invite_and_accept(client, account["id"], "viewer4@example.com", "VIEWER")

    r = client.get(f"/api/accounts/{account['id']}/trades")
    assert r.status_code == 200
    scripts = {t["script_name"] for t in r.json()}
    assert scripts == {"RELIANCE", "TCS"}


def test_bulk_import_is_idempotent_by_client_supplied_id(client, db_sessionmaker):
    owner = _signup(client, "trade5@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])

    trade_with_id = {**SAMPLE_TRADE, "id": "dexie-local-uuid-1"}
    r1 = client.post(f"/api/accounts/{account['id']}/trades/bulk-import", json={"trades": [trade_with_id]})
    assert r1.status_code == 201
    assert r1.json() == {"imported": 1, "skipped_existing": 0}

    # Re-running the same import (e.g. a retried request) never duplicates.
    r2 = client.post(f"/api/accounts/{account['id']}/trades/bulk-import", json={"trades": [trade_with_id]})
    assert r2.json() == {"imported": 0, "skipped_existing": 1}

    with db_sessionmaker() as db:
        count = db.query(models.Trade).filter(models.Trade.trading_account_id == account["id"]).count()
    assert count == 1


def test_bulk_import_requires_admin(client):
    owner = _signup(client, "trade6@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    _invite_and_accept(client, account["id"], "viewer6@example.com", "VIEWER")

    r = client.post(f"/api/accounts/{account['id']}/trades/bulk-import", json={"trades": [SAMPLE_TRADE]})
    assert r.status_code == 403


def test_deleting_account_cascades_trades(client, db_sessionmaker):
    owner = _signup(client, "trade7@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.post(f"/api/accounts/{account['id']}/trades", json=SAMPLE_TRADE)

    r = client.delete(f"/api/accounts/{account['id']}")
    assert r.status_code == 204

    with db_sessionmaker() as db:
        remaining = db.query(models.Trade).filter(models.Trade.trading_account_id == account["id"]).all()
    assert remaining == []


def test_trade_mutations_are_audited(client, db_sessionmaker):
    owner = _signup(client, "trade8@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])

    r = client.post(f"/api/accounts/{account['id']}/trades", json=SAMPLE_TRADE)
    trade_id = r.json()["id"]
    client.patch(f"/api/accounts/{account['id']}/trades/{trade_id}", json={"notes": "edited"})
    client.delete(f"/api/accounts/{account['id']}/trades/{trade_id}")
    client.post(f"/api/accounts/{account['id']}/trades/bulk-import", json={"trades": [SAMPLE_TRADE]})

    with db_sessionmaker() as db:
        actions = {
            row.action
            for row in db.query(models.AuditLog).filter(models.AuditLog.trading_account_id == account["id"]).all()
        }
    assert {"TRADE_CREATED", "TRADE_UPDATED", "TRADE_DELETED", "TRADE_BULK_IMPORTED"} <= actions


def test_updating_nonexistent_trade_returns_404(client):
    owner = _signup(client, "trade9@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    r = client.patch(f"/api/accounts/{account['id']}/trades/does-not-exist", json={"notes": "x"})
    assert r.status_code == 404
