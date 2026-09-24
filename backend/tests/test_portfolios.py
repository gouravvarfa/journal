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


def _create_portfolio(client, workspace_id, name="Client Portfolio"):
    r = client.post("/api/portfolios", json={"workspace_id": workspace_id, "name": name, "client_display_name": name})
    assert r.status_code == 201
    return r.json()


def _assign_account_to_portfolio(client, account_id, portfolio_id):
    r = client.patch(f"/api/accounts/{account_id}", json={"portfolio_id": portfolio_id})
    assert r.status_code == 200
    return r.json()


def _invite_and_accept_portfolio(client, portfolio_id, email, role):
    r = client.post(f"/api/portfolios/{portfolio_id}/invitations", json={"email": email, "role": role})
    invitation_id = r.json()["id"]
    client.post("/api/auth/logout")
    _signup(client, email, f"{role} person")
    r_accept = client.post(f"/api/portfolio-invitations/{invitation_id}/accept")
    assert r_accept.status_code == 200


def test_manager_can_create_portfolio_and_assign_accounts(client):
    owner = _signup(client, "pm1@example.com", "Manager")
    ws = owner["workspaces"][0]["id"]
    portfolio = _create_portfolio(client, ws)
    account = _create_account(client, ws, "Client A - Account 1")

    updated = _assign_account_to_portfolio(client, account["id"], portfolio["id"])
    assert updated["portfolio_id"] == portfolio["id"]

    r = client.get(f"/api/portfolios/{portfolio['id']}")
    assert r.status_code == 200
    assert r.json()["account_count"] == 1


def test_client_invited_to_portfolio_sees_all_its_accounts_without_per_account_invite(client):
    owner = _signup(client, "pm2@example.com", "Manager")
    ws = owner["workspaces"][0]["id"]
    portfolio = _create_portfolio(client, ws, "Client B")
    account1 = _create_account(client, ws, "Client B - Equity")
    account2 = _create_account(client, ws, "Client B - F&O")
    _assign_account_to_portfolio(client, account1["id"], portfolio["id"])
    _assign_account_to_portfolio(client, account2["id"], portfolio["id"])

    client.post(f"/api/accounts/{account1['id']}/trades", json={
        "trade_date": "2026-01-01", "segment": "EQUITY", "script_name": "TCS", "reason": "x",
        "quantity": 1, "side": "BUY", "entry_price": 100, "exit_date": None, "exit_price": 0,
        "status": "OPEN", "gross_pnl": 0, "net_pnl": 0, "notes": "",
    })

    _invite_and_accept_portfolio(client, portfolio["id"], "client2@example.com", "VIEWER")

    r_list = client.get("/api/accounts")
    assert r_list.status_code == 200
    ids = {a["id"] for a in r_list.json()}
    assert ids == {account1["id"], account2["id"]}

    r_trades = client.get(f"/api/accounts/{account1['id']}/trades")
    assert r_trades.status_code == 200
    assert len(r_trades.json()) == 1


def test_portfolio_client_is_always_viewer_even_if_invited_as_admin_role_string(client):
    """
    Portfolio-derived account access is always VIEWER-equivalent — a
    Client is never Admin/Owner on the accounts under their portfolio,
    even if invited with role=ADMIN at the portfolio level (which only
    controls portfolio-management actions, not account write access).
    """
    owner = _signup(client, "pm3@example.com", "Manager")
    ws = owner["workspaces"][0]["id"]
    portfolio = _create_portfolio(client, ws, "Client C")
    account = _create_account(client, ws, "Client C - Account")
    _assign_account_to_portfolio(client, account["id"], portfolio["id"])

    _invite_and_accept_portfolio(client, portfolio["id"], "client3@example.com", "ADMIN")

    assert client.post(f"/api/accounts/{account['id']}/trades", json={
        "trade_date": "2026-01-01", "segment": "EQUITY", "script_name": "X", "reason": "",
        "quantity": 1, "side": "BUY", "entry_price": 1, "exit_date": None, "exit_price": 0,
        "status": "OPEN", "gross_pnl": 0, "net_pnl": 0, "notes": "",
    }).status_code == 403
    assert client.get(f"/api/accounts/{account['id']}/trades").status_code == 200


def test_portfolio_isolation_client_a_cannot_see_client_b(client):
    owner = _signup(client, "pm4@example.com", "Manager")
    ws = owner["workspaces"][0]["id"]
    portfolio_a = _create_portfolio(client, ws, "Client A")
    portfolio_b = _create_portfolio(client, ws, "Client B")
    account_a = _create_account(client, ws, "A account")
    account_b = _create_account(client, ws, "B account")
    _assign_account_to_portfolio(client, account_a["id"], portfolio_a["id"])
    _assign_account_to_portfolio(client, account_b["id"], portfolio_b["id"])

    _invite_and_accept_portfolio(client, portfolio_a["id"], "clienta4@example.com", "VIEWER")

    # Client A must never see portfolio B or account B, even by real ID (IDOR).
    assert client.get(f"/api/portfolios/{portfolio_b['id']}").status_code == 404
    assert client.get(f"/api/accounts/{account_b['id']}").status_code == 404
    assert client.get(f"/api/accounts/{account_b['id']}/trades").status_code == 404

    r_list = client.get("/api/accounts")
    assert {a["id"] for a in r_list.json()} == {account_a["id"]}


def test_deleting_portfolio_does_not_delete_its_accounts(client, db_sessionmaker):
    owner = _signup(client, "pm5@example.com", "Manager")
    ws = owner["workspaces"][0]["id"]
    portfolio = _create_portfolio(client, ws)
    account = _create_account(client, ws)
    _assign_account_to_portfolio(client, account["id"], portfolio["id"])

    r = client.delete(f"/api/portfolios/{portfolio['id']}")
    assert r.status_code == 204

    # Account survives, un-assigned — never auto-deleted.
    r_get = client.get(f"/api/accounts/{account['id']}")
    assert r_get.status_code == 200
    assert r_get.json()["portfolio_id"] is None


def test_cannot_assign_account_to_a_portfolio_in_another_workspace(client):
    owner_a = _signup(client, "pm6a@example.com", "ManagerA")
    ws_a = owner_a["workspaces"][0]["id"]
    account = _create_account(client, ws_a)
    client.post("/api/auth/logout")

    owner_b = _signup(client, "pm6b@example.com", "ManagerB")
    ws_b = owner_b["workspaces"][0]["id"]
    portfolio_b = _create_portfolio(client, ws_b)
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "pm6a@example.com", "password": "password123"})
    r = client.patch(f"/api/accounts/{account['id']}", json={"portfolio_id": portfolio_b["id"]})
    assert r.status_code == 404


def test_revoking_portfolio_access_is_immediate(client):
    owner = _signup(client, "pm7@example.com", "Manager")
    ws = owner["workspaces"][0]["id"]
    portfolio = _create_portfolio(client, ws)
    account = _create_account(client, ws)
    _assign_account_to_portfolio(client, account["id"], portfolio["id"])
    _invite_and_accept_portfolio(client, portfolio["id"], "client7@example.com", "VIEWER")

    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "pm7@example.com", "password": "password123"})
    members = client.get(f"/api/portfolios/{portfolio['id']}/members").json()
    client_member = next(m for m in members if m["email"] == "client7@example.com")
    assert client.delete(f"/api/portfolios/{portfolio['id']}/members/{client_member['id']}").status_code == 204

    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "client7@example.com", "password": "password123"})
    assert client.get(f"/api/accounts/{account['id']}").status_code == 404
    assert client.get("/api/accounts").json() == []


def test_portfolio_actions_are_audited(client, db_sessionmaker):
    owner = _signup(client, "pm8@example.com", "Manager")
    ws = owner["workspaces"][0]["id"]
    portfolio = _create_portfolio(client, ws)
    client.patch(f"/api/portfolios/{portfolio['id']}", json={"name": "Renamed"})
    client.delete(f"/api/portfolios/{portfolio['id']}")

    with db_sessionmaker() as db:
        actions = {row.action for row in db.query(models.AuditLog).filter(models.AuditLog.workspace_id == ws).all()}
    assert {"PORTFOLIO_CREATED", "PORTFOLIO_UPDATED", "PORTFOLIO_DELETED"} <= actions


def test_outsider_cannot_create_portfolio_in_someone_elses_workspace(client):
    owner = _signup(client, "pm9@example.com", "Manager")
    ws = owner["workspaces"][0]["id"]
    client.post("/api/auth/logout")

    _signup(client, "outsider9@example.com", "Outsider")
    r = client.post("/api/portfolios", json={"workspace_id": ws, "name": "Sneaky"})
    assert r.status_code == 404
