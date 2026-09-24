from __future__ import annotations


def _signup(client, email, name):
    r = client.post("/api/auth/signup", json={"email": email, "password": "password123", "display_name": name})
    assert r.status_code == 201
    return r.json()


def test_user_cannot_access_another_users_workspace(client):
    user_a = _signup(client, "usera@example.com", "User A")
    workspace_a_id = user_a["workspaces"][0]["id"]
    client.post("/api/auth/logout")

    _signup(client, "userb@example.com", "User B")  # now logged in as B

    r = client.get(f"/api/workspaces/{workspace_a_id}")
    assert r.status_code == 404  # never a 403 — B should not even learn A's workspace exists


def test_user_can_access_their_own_workspace(client):
    user_a = _signup(client, "usera2@example.com", "User A2")
    workspace_a_id = user_a["workspaces"][0]["id"]

    r = client.get(f"/api/workspaces/{workspace_a_id}")
    assert r.status_code == 200
    assert r.json()["id"] == workspace_a_id


def test_each_user_only_lists_their_own_workspaces(client):
    _signup(client, "usera3@example.com", "User A3")
    client.post("/api/auth/logout")
    user_b = _signup(client, "userb3@example.com", "User B3")

    r = client.get("/api/workspaces")
    assert r.status_code == 200
    ids = [w["id"] for w in r.json()]
    assert ids == [user_b["workspaces"][0]["id"]]


def test_changing_workspace_id_in_the_request_cannot_bypass_authorization(client):
    # IDOR check: User B guesses/knows User A's real workspace ID and asks
    # for it directly — authorization must still be enforced server-side.
    user_a = _signup(client, "usera4@example.com", "User A4")
    workspace_a_id = user_a["workspaces"][0]["id"]
    client.post("/api/auth/logout")

    _signup(client, "userb4@example.com", "User B4")
    r = client.get(f"/api/workspaces/{workspace_a_id}")
    assert r.status_code == 404

    r_bogus = client.get("/api/workspaces/not-a-real-id")
    assert r_bogus.status_code == 404
