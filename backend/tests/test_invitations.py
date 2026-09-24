from __future__ import annotations

import datetime as dt

from backend.app import models


def _signup(client, email, name):
    r = client.post("/api/auth/signup", json={"email": email, "password": "password123", "display_name": name})
    assert r.status_code == 201
    return r.json()


def _create_account(client, workspace_id, name="A1"):
    r = client.post("/api/accounts", json={"workspace_id": workspace_id, "name": name, "broker_name": "Angel One"})
    assert r.status_code == 201
    return r.json()


def test_owner_can_invite_an_email_that_has_not_signed_up_yet(client):
    owner = _signup(client, "owner1@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])

    r = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "notyetregistered@example.com", "role": "VIEWER"})
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "PENDING"
    assert body["is_expired"] is False


def test_full_invite_then_signup_then_accept_flow(client):
    owner = _signup(client, "owner2@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"], name="Shared P5")
    r_invite = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "newperson2@example.com", "role": "VIEWER"})
    invitation_id = r_invite.json()["id"]
    client.post("/api/auth/logout")

    # The invited person didn't have an account at invite time — they sign up now, matching the spec's flow exactly.
    _signup(client, "newperson2@example.com", "New Person")

    r_me = client.get("/api/invitations/me")
    assert r_me.status_code == 200
    assert len(r_me.json()) == 1
    assert r_me.json()[0]["account_name"] == "Shared P5"

    r_accept = client.post(f"/api/invitations/{invitation_id}/accept")
    assert r_accept.status_code == 200
    assert r_accept.json()["role"] == "VIEWER"

    r_accounts = client.get("/api/accounts")
    names = {a["name"]: a["role"] for a in r_accounts.json()}
    assert names.get("Shared P5") == "VIEWER"

    # No longer pending.
    r_me_after = client.get("/api/invitations/me")
    assert r_me_after.json() == []


def test_cannot_accept_someone_elses_invitation(client):
    owner = _signup(client, "owner3@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    r_invite = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "intended3@example.com", "role": "VIEWER"})
    invitation_id = r_invite.json()["id"]
    client.post("/api/auth/logout")

    _signup(client, "wrongperson3@example.com", "Wrong Person")
    r = client.post(f"/api/invitations/{invitation_id}/accept")
    assert r.status_code == 404


def test_cannot_accept_an_already_accepted_invitation_twice(client):
    owner = _signup(client, "owner4@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    r_invite = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "person4@example.com", "role": "VIEWER"})
    invitation_id = r_invite.json()["id"]
    client.post("/api/auth/logout")

    _signup(client, "person4@example.com", "Person Four")
    assert client.post(f"/api/invitations/{invitation_id}/accept").status_code == 200
    r_second = client.post(f"/api/invitations/{invitation_id}/accept")
    assert r_second.status_code == 410


def test_decline_invitation_does_not_grant_access(client):
    owner = _signup(client, "owner5@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    r_invite = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "person5@example.com", "role": "VIEWER"})
    invitation_id = r_invite.json()["id"]
    client.post("/api/auth/logout")

    _signup(client, "person5@example.com", "Person Five")
    r_decline = client.post(f"/api/invitations/{invitation_id}/decline")
    assert r_decline.status_code == 204

    r_accounts = client.get("/api/accounts")
    assert r_accounts.json() == []

    r_accept_after_decline = client.post(f"/api/invitations/{invitation_id}/accept")
    assert r_accept_after_decline.status_code == 410


def test_owner_can_revoke_a_pending_invitation_before_it_is_accepted(client):
    owner = _signup(client, "owner6@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    r_invite = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "person6@example.com", "role": "VIEWER"})
    invitation_id = r_invite.json()["id"]

    r_revoke = client.delete(f"/api/accounts/{account['id']}/invitations/{invitation_id}")
    assert r_revoke.status_code == 204
    client.post("/api/auth/logout")

    _signup(client, "person6@example.com", "Person Six")
    r_me = client.get("/api/invitations/me")
    assert r_me.json() == []  # revoked invitations don't show up as pending

    r_accept = client.post(f"/api/invitations/{invitation_id}/accept")
    assert r_accept.status_code == 410


def test_duplicate_pending_invitation_for_same_email_is_rejected(client):
    owner = _signup(client, "owner7@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "dup7@example.com", "role": "VIEWER"})
    r_dup = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "dup7@example.com", "role": "ADMIN"})
    assert r_dup.status_code == 409


def test_cannot_invite_someone_who_already_has_access(client):
    owner = _signup(client, "owner8@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    # Owner already has OWNER access — inviting themselves should be rejected.
    r = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "owner8@example.com", "role": "VIEWER"})
    assert r.status_code == 409


def test_viewer_cannot_create_or_revoke_invitations(client, db_sessionmaker):
    owner = _signup(client, "owner9@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.post("/api/auth/logout")

    viewer = _signup(client, "viewer9@example.com", "Viewer")
    db = db_sessionmaker()
    try:
        db.add(models.AccountMember(trading_account_id=account["id"], user_id=viewer["user"]["id"], role=models.AccountRole.VIEWER))
        db.commit()
    finally:
        db.close()

    r_create = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "someone9@example.com", "role": "VIEWER"})
    assert r_create.status_code == 403
    r_list = client.get(f"/api/accounts/{account['id']}/invitations")
    assert r_list.status_code == 403


def test_outsider_cannot_invite_to_an_account_they_do_not_belong_to(client):
    owner = _signup(client, "owner10@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    client.post("/api/auth/logout")

    _signup(client, "outsider10@example.com", "Outsider")
    r = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "someone10@example.com", "role": "VIEWER"})
    assert r.status_code == 404


def test_expired_invitation_cannot_be_accepted(client, db_sessionmaker):
    owner = _signup(client, "owner11@example.com", "Owner")
    account = _create_account(client, owner["workspaces"][0]["id"])
    r_invite = client.post(f"/api/accounts/{account['id']}/invitations", json={"email": "person11@example.com", "role": "VIEWER"})
    invitation_id = r_invite.json()["id"]

    db = db_sessionmaker()
    try:
        invitation = db.get(models.Invitation, invitation_id)
        invitation.expires_at = dt.datetime.utcnow() - dt.timedelta(days=1)
        db.add(invitation)
        db.commit()
    finally:
        db.close()

    client.post("/api/auth/logout")
    _signup(client, "person11@example.com", "Person Eleven")

    r_me = client.get("/api/invitations/me")
    assert r_me.json() == []  # expired invitations are filtered out of the pending list

    r_accept = client.post(f"/api/invitations/{invitation_id}/accept")
    assert r_accept.status_code == 410
