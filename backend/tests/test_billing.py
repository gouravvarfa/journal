from __future__ import annotations

import hashlib
import hmac
import json

import pytest

from backend.app import models, security
from backend.app.config import settings
from backend.app.routers import billing as billing_router


def _signup(client, email, name):
    r = client.post("/api/auth/signup", json={"email": email, "password": "password123", "display_name": name})
    assert r.status_code == 201
    return r.json()


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return self._payload


@pytest.fixture()
def mock_razorpay_order(monkeypatch):
    """Never hit the real Razorpay API in tests — return a fake order id deterministically."""

    def _fake_post(url, auth=None, json=None, timeout=None):  # noqa: A002 - matches httpx.post signature
        return _FakeResponse({"id": f"order_fake_{json['receipt']}", "amount": json["amount"], "currency": "INR"})

    monkeypatch.setattr(billing_router.httpx, "post", _fake_post)


def _sign_payment(order_id: str, payment_id: str) -> str:
    return hmac.new(settings.razorpay_key_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def test_pricing_is_public_and_lists_all_plans(client):
    r = client.get("/api/billing/plans")
    assert r.status_code == 200
    names = {p["name"] for p in r.json()}
    assert names == {"FREE", "PRO", "PREMIUM", "BUSINESS"}
    free = next(p for p in r.json() if p["name"] == "FREE")
    assert free["price_monthly_paise"] == 0
    pro = next(p for p in r.json() if p["name"] == "PRO")
    assert pro["price_monthly_paise"] == 49900


def test_checkout_creates_pending_subscription(client, mock_razorpay_order, db_sessionmaker):
    owner = _signup(client, "bill1@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]

    r = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "PRO", "billing_cycle": "MONTHLY"})
    assert r.status_code == 201
    body = r.json()
    assert body["key_id"] == settings.razorpay_key_id
    assert body["amount_paise"] == 49900
    assert body["order_id"].startswith("order_fake_")

    with db_sessionmaker() as db:
        sub = db.query(models.Subscription).filter(models.Subscription.workspace_id == ws).one()
        assert sub.status == models.SubscriptionStatus.PENDING
        assert sub.razorpay_order_id == body["order_id"]


def test_checkout_rejects_free_plan(client, mock_razorpay_order):
    owner = _signup(client, "bill2@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]
    r = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "FREE", "billing_cycle": "MONTHLY"})
    assert r.status_code == 400


def test_non_owner_cannot_checkout(client, mock_razorpay_order):
    owner = _signup(client, "bill3@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]
    client.post("/api/auth/logout")
    _signup(client, "outsider3@example.com", "Outsider")
    r = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "PRO", "billing_cycle": "MONTHLY"})
    assert r.status_code == 404


def test_full_checkout_then_verify_activates_plan(client, mock_razorpay_order, db_sessionmaker):
    owner = _signup(client, "bill4@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]

    r_checkout = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "BUSINESS", "billing_cycle": "YEARLY"})
    order_id = r_checkout.json()["order_id"]

    fake_payment_id = "pay_fake_123"
    signature = _sign_payment(order_id, fake_payment_id)

    r_verify = client.post(
        f"/api/billing/workspaces/{ws}/verify",
        json={"razorpay_order_id": order_id, "razorpay_payment_id": fake_payment_id, "razorpay_signature": signature},
    )
    assert r_verify.status_code == 200
    body = r_verify.json()
    assert body["plan"] == "BUSINESS"
    assert body["subscription_status"] == "ACTIVE"
    assert body["current_period_end"] is not None

    r_workspace = client.get(f"/api/workspaces/{ws}")
    assert r_workspace.json()["plan"] == "BUSINESS"


def test_verify_rejects_tampered_signature(client, mock_razorpay_order):
    owner = _signup(client, "bill5@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]
    r_checkout = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "PRO", "billing_cycle": "MONTHLY"})
    order_id = r_checkout.json()["order_id"]

    r_verify = client.post(
        f"/api/billing/workspaces/{ws}/verify",
        json={"razorpay_order_id": order_id, "razorpay_payment_id": "pay_fake", "razorpay_signature": "not-the-real-signature"},
    )
    assert r_verify.status_code == 400

    r_workspace = client.get(f"/api/workspaces/{ws}")
    assert r_workspace.json()["plan"] == "FREE"  # unchanged


def test_verify_rejects_mismatched_order_id(client, mock_razorpay_order):
    owner = _signup(client, "bill6@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]
    client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "PRO", "billing_cycle": "MONTHLY"})

    fake_order_id = "order_never_created"
    signature = _sign_payment(fake_order_id, "pay_x")
    r_verify = client.post(
        f"/api/billing/workspaces/{ws}/verify",
        json={"razorpay_order_id": fake_order_id, "razorpay_payment_id": "pay_x", "razorpay_signature": signature},
    )
    assert r_verify.status_code == 404


def _webhook_body_and_signature(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    signature = hmac.new(settings.razorpay_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    return body, signature


def test_webhook_activates_subscription_as_a_safety_net(client, mock_razorpay_order, db_sessionmaker):
    owner = _signup(client, "bill7@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]
    r_checkout = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "PRO", "billing_cycle": "MONTHLY"})
    order_id = r_checkout.json()["order_id"]

    payload = {
        "id": "evt_webhook_1",
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": "pay_webhook_1", "order_id": order_id, "amount": 49900}}},
    }
    body, signature = _webhook_body_and_signature(payload)
    r = client.post("/api/billing/webhook", content=body, headers={"X-Razorpay-Signature": signature, "Content-Type": "application/json"})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    with db_sessionmaker() as db:
        sub = db.query(models.Subscription).filter(models.Subscription.workspace_id == ws).one()
        assert sub.status == models.SubscriptionStatus.ACTIVE


def test_webhook_rejects_bad_signature(client):
    payload = {"id": "evt_bad", "event": "payment.captured", "payload": {}}
    body = json.dumps(payload).encode()
    r = client.post("/api/billing/webhook", content=body, headers={"X-Razorpay-Signature": "wrong", "Content-Type": "application/json"})
    assert r.status_code == 400


def test_webhook_is_idempotent_on_replay(client, mock_razorpay_order, db_sessionmaker):
    owner = _signup(client, "bill8@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]
    r_checkout = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "PRO", "billing_cycle": "MONTHLY"})
    order_id = r_checkout.json()["order_id"]

    payload = {
        "id": "evt_replay_1",
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": "pay_replay_1", "order_id": order_id, "amount": 49900}}},
    }
    body, signature = _webhook_body_and_signature(payload)
    headers = {"X-Razorpay-Signature": signature, "Content-Type": "application/json"}

    r1 = client.post("/api/billing/webhook", content=body, headers=headers)
    r2 = client.post("/api/billing/webhook", content=body, headers=headers)
    assert r1.json()["status"] == "ok"
    assert r2.json()["status"] == "already_processed"

    with db_sessionmaker() as db:
        events = db.query(models.WebhookEvent).filter(models.WebhookEvent.razorpay_event_id == "evt_replay_1").all()
        payments = db.query(models.Payment).filter(models.Payment.razorpay_payment_id == "pay_replay_1").all()
    assert len(events) == 1
    assert len(payments) == 1


def test_downgrade_never_deletes_existing_accounts(client, mock_razorpay_order):
    owner = _signup(client, "bill9@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]

    r_checkout = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "BUSINESS", "billing_cycle": "MONTHLY"})
    order_id = r_checkout.json()["order_id"]
    signature = _sign_payment(order_id, "pay_up")
    client.post(
        f"/api/billing/workspaces/{ws}/verify",
        json={"razorpay_order_id": order_id, "razorpay_payment_id": "pay_up", "razorpay_signature": signature},
    )

    for i in range(5):
        r = client.post("/api/accounts", json={"workspace_id": ws, "name": f"Account {i}"})
        assert r.status_code == 201

    r_checkout2 = client.post(f"/api/billing/workspaces/{ws}/checkout", json={"plan_name": "PRO", "billing_cycle": "MONTHLY"})
    order_id2 = r_checkout2.json()["order_id"]
    signature2 = _sign_payment(order_id2, "pay_down")
    r_verify2 = client.post(
        f"/api/billing/workspaces/{ws}/verify",
        json={"razorpay_order_id": order_id2, "razorpay_payment_id": "pay_down", "razorpay_signature": signature2},
    )
    assert r_verify2.status_code == 200
    assert r_verify2.json()["plan"] == "PRO"

    r_accounts = client.get("/api/accounts")
    assert len(r_accounts.json()) == 5  # nothing deleted despite now being "over" PRO's informational limit


def test_billing_status_reflects_current_plan_and_usage(client, mock_razorpay_order):
    owner = _signup(client, "bill10@example.com", "Owner")
    ws = owner["workspaces"][0]["id"]

    r = client.get(f"/api/billing/workspaces/{ws}/status")
    assert r.status_code == 200
    body = r.json()
    assert body["plan"] == "FREE"
    assert body["subscription_status"] is None
    assert body["trading_accounts_used"] == 0
