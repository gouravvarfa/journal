from __future__ import annotations


def _signup(client, email, name):
    r = client.post("/api/auth/signup", json={"email": email, "password": "password123", "display_name": name})
    assert r.status_code == 201
    return r.json()


def _create_account(client, workspace_id, name="A1"):
    r = client.post("/api/accounts", json={"workspace_id": workspace_id, "name": name, "broker_name": "Angel One"})
    assert r.status_code == 201
    return r.json()


def test_owner_can_add_an_existing_user_as_viewer(client):
    owner = _signup(client, "owner1@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)
    client.post("/api/auth/logout")

    _signup(client, "viewer1@example.com", "Viewer One")  # the person being granted access must already exist
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "owner1@example.com", "password": "password123"})

    r = client.post(f"/api/accounts/{account['id']}/members", json={"email": "viewer1@example.com", "role": "VIEWER"})
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "viewer1@example.com"
    assert body["role"] == "VIEWER"


def test_added_viewer_immediately_sees_the_shared_account(client):
    owner = _signup(client, "owner2@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id, name="Shared Account")
    client.post("/api/auth/logout")

    _signup(client, "viewer2@example.com", "Viewer Two")
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "owner2@example.com", "password": "password123"})
    client.post(f"/api/accounts/{account['id']}/members", json={"email": "viewer2@example.com", "role": "VIEWER"})
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "viewer2@example.com", "password": "password123"})
    r = client.get("/api/accounts")
    assert r.status_code == 200
    names = {a["name"]: a["role"] for a in r.json()}
    assert names.get("Shared Account") == "VIEWER"

    r_detail = client.get(f"/api/accounts/{account['id']}")
    assert r_detail.status_code == 200


def test_viewer_cannot_edit_or_delete_the_shared_account(client):
    owner = _signup(client, "owner3@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)
    client.post("/api/auth/logout")

    _signup(client, "viewer3@example.com", "Viewer Three")
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "owner3@example.com", "password": "password123"})
    client.post(f"/api/accounts/{account['id']}/members", json={"email": "viewer3@example.com", "role": "VIEWER"})
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "viewer3@example.com", "password": "password123"})
    assert client.patch(f"/api/accounts/{account['id']}", json={"name": "Renamed"}).status_code == 403
    assert client.delete(f"/api/accounts/{account['id']}").status_code == 403


def test_viewer_cannot_invite_or_manage_permissions(client):
    owner = _signup(client, "owner4@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)
    client.post("/api/auth/logout")

    _signup(client, "viewer4@example.com", "Viewer Four")
    third = _signup(client, "third4@example.com", "Third Person")
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "owner4@example.com", "password": "password123"})
    client.post(f"/api/accounts/{account['id']}/members", json={"email": "viewer4@example.com", "role": "VIEWER"})
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "viewer4@example.com", "password": "password123"})
    # Viewer tries to invite a third person.
    r_invite = client.post(f"/api/accounts/{account['id']}/members", json={"email": "third4@example.com", "role": "VIEWER"})
    assert r_invite.status_code == 403
    # Viewer tries to view the members list.
    r_list = client.get(f"/api/accounts/{account['id']}/members")
    assert r_list.status_code == 403
    assert third["user"]["email"] == "third4@example.com"  # sanity: third person exists, just wasn't added


def test_admin_can_edit_account_but_cannot_manage_members(client):
    owner = _signup(client, "owner5@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)
    client.post("/api/auth/logout")

    _signup(client, "admin5@example.com", "Admin Five")
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "owner5@example.com", "password": "password123"})
    client.post(f"/api/accounts/{account['id']}/members", json={"email": "admin5@example.com", "role": "ADMIN"})
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "admin5@example.com", "password": "password123"})
    assert client.patch(f"/api/accounts/{account['id']}", json={"name": "Renamed by admin"}).status_code == 200
    assert client.delete(f"/api/accounts/{account['id']}").status_code == 403
    assert client.post(f"/api/accounts/{account['id']}/members", json={"email": "owner5@example.com", "role": "VIEWER"}).status_code == 403


def test_owner_can_revoke_access_and_it_takes_effect_immediately(client):
    owner = _signup(client, "owner6@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)
    client.post("/api/auth/logout")

    _signup(client, "viewer6@example.com", "Viewer Six")
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "owner6@example.com", "password": "password123"})
    add_r = client.post(f"/api/accounts/{account['id']}/members", json={"email": "viewer6@example.com", "role": "VIEWER"})
    member_id = add_r.json()["id"]

    r_remove = client.delete(f"/api/accounts/{account['id']}/members/{member_id}")
    assert r_remove.status_code == 204
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"email": "viewer6@example.com", "password": "password123"})
    r_get = client.get(f"/api/accounts/{account['id']}")
    assert r_get.status_code == 404  # access gone on the very next request, no caching/delay
    r_list = client.get("/api/accounts")
    assert r_list.json() == []


def test_cannot_remove_the_last_owner(client):
    owner = _signup(client, "owner7@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)

    members = client.get(f"/api/accounts/{account['id']}/members").json()
    owner_member = next(m for m in members if m["role"] == "OWNER")

    r = client.delete(f"/api/accounts/{account['id']}/members/{owner_member['id']}")
    assert r.status_code == 400


def test_inviting_an_unregistered_email_fails_clearly_not_silently(client):
    owner = _signup(client, "owner8@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)

    r = client.post(f"/api/accounts/{account['id']}/members", json={"email": "nobody-signed-up@example.com", "role": "VIEWER"})
    assert r.status_code == 404


def test_non_owner_outsider_cannot_add_members_to_someone_elses_account(client):
    owner = _signup(client, "owner9@example.com", "Owner")
    ws_id = owner["workspaces"][0]["id"]
    account = _create_account(client, ws_id)
    client.post("/api/auth/logout")

    _signup(client, "outsider9@example.com", "Outsider")
    r = client.post(f"/api/accounts/{account['id']}/members", json={"email": "owner9@example.com", "role": "VIEWER"})
    assert r.status_code == 404  # outsider isn't even a member, so 404 not 403
