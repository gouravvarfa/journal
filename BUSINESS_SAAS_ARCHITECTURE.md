# Business SaaS Architecture

Status: **Planning document only. No implementation started for anything described here.** This document expands on the "Phase 10+" section of `ARCHITECTURE_PLAN.md`, which covers the already-implemented, already-tested multi-tenant foundation (Phases 1–9: auth, workspaces, trading accounts, sharing, roles, audit log, broker credential security, plan/entitlement tracking — see that file for what already exists).

This document exists because the product scope grew from "a shareable trading journal" into a sellable, multi-tenant SaaS product: real trade data behind sharing, a portfolio-manager/client layer, subscription billing via Razorpay, and a public marketing site. Nothing below is built yet. Build order is confirmed as: **(1) Trade backend + sync → (2) Portfolio/Client layer → (3) Razorpay billing → (4) Public marketing website**, one phase at a time, each verified (backend tests + frontend build + manual check that existing functionality survives) before the next begins — exactly the discipline already used for Phases 1–9.

---

## 1. Product Architecture

Three experiences, one codebase:

```
Public Website (marketing, unauthenticated)
        │
        ▼
   Login / Signup  ──────────────► (existing AuthGate, Phase 1)
        │
        ▼
   SaaS Application ────► Workspace ────► Portfolios ────► Trading Accounts ────► Trades
        │                                      │
        │                                      ▼
        │                              Account/Portfolio Sharing (Invitation)
        │                                      │
        ▼                                      ▼
  (Owner/Admin view)                    Client Portal (read-only)
```

- A **User** is an application identity (email + password) — one identity can be an OWNER in their own workspace and simultaneously a Client/Viewer in someone else's. This is already true today for `AccountMember`; it extends unchanged to `PortfolioMember`.
- A **Workspace** is the paying customer's environment (one per signup, as today).
- A **Portfolio** is an optional logical grouping of Trading Accounts inside a workspace — used by portfolio managers to bundle "everything belonging to Client X" behind one invite. A solo trader never creates one; their Trading Accounts simply have `portfolio_id = NULL`, unchanged from today.
- A **Trading Account** is, as today, the actual unit of trade data and the unit every permission check ultimately resolves to.
- The **Client Portal** is not a fourth codebase — it's the same authenticated shell (`AuthGate` → app), rendered in a restricted mode: a user whose only roles anywhere are VIEWER sees "My Portfolio" navigation instead of "My Workspace" navigation, with no owner/admin controls rendered (server-enforced regardless — see Section 9).

## 2. Public Website Architecture

New routes, added via a router (React Router — the first router this app has needed, since today's `App.tsx` renders every tab internally with no URL routing at all):

| Route | Purpose |
|---|---|
| `/` | Hero, problem/solution, feature overview, how-it-works, pricing preview, FAQ, final CTA |
| `/features` | Trading Journal, Multi-Account, Portfolio Management, Client Portal, Analytics, Reports, Broker Integrations, (future) AI/Advanced Analytics |
| `/for-traders` | Individual trader use case — one account on Free, upgrade path |
| `/for-portfolio-managers` | Manager use case — client tree diagram, invite/revoke flow, reporting |
| `/pricing` | Billing-cycle toggle (Monthly/Quarterly/Yearly), FREE/PRO/BUSINESS cards, sourced from the DB-backed `Plan` table (Section 5), never hardcoded prices in component code |
| `/security` | Account isolation, auth model, encryption, audit logs, revocation — descriptive only, no unsupported certification claims |
| `/about`, `/contact` | Standard |
| `/login`, `/signup`, `/forgot-password` | Route into the existing `AuthGate` components, not reimplemented |

Visual identity is deliberately distinct from the app shell: its own layout component (no `WorkspaceBar`, no dashboard chrome), clean/professional fintech aesthetic per the user's explicit anti-patterns list (no flashy crypto aesthetics, no fake numbers, no urgency gimmicks, no gambling-style UI). Implemented as `src/marketing/` — a sibling to `src/workspace/`, not a separate build/deploy pipeline, so one `vite build` still produces the whole site.

Demo data shown in the hero product visual is explicitly labelled "Demo data" in the UI — never presented as if it were a real customer's numbers.

## 3. SaaS Application Architecture

Extends the existing `AuthGate → WorkspaceBar → App` shell (Phases 1–9, unchanged) with:

- **Portfolio views**: a manager's workspace shows Portfolios alongside Trading Accounts; opening a Portfolio lists its Trading Accounts and its Clients (via `PortfolioMember`).
- **Billing page**: current plan, subscription status, billing cycle, next billing date, accounts-used vs. accounts-limit, upgrade/manage-subscription actions (Section 6).
- **Account dashboard** (per Trading Account, existing + extended): Overview / Trades / Journal / Charts / Analytics / Reports / Users & Permissions — Owner/Admin see management controls, Viewer sees read-only, identically to how `ManageAccessPanel` already gates today.
- **Account switcher at scale**: today's switcher (`src/workspace/AccountSwitcher.tsx`) assumes a short list; once accounts aren't capped (Phase 8 already established "no arbitrary limit"), it needs search/filter and must stay usable with 100+ accounts — a UI change to that one component, not an architecture change.

## 4. Client Portal Architecture

A Client is a `User` whose access to a Portfolio (and transitively every Trading Account under it) comes from a `PortfolioMember` row with role VIEWER — there is no separate "Client" identity type, no separate signup flow, no separate database table for "who is a client." This mirrors the existing decision that a Viewer on a Trading Account is just a `User` + an `AccountMember` row, not a special kind of user.

What a Client sees: Portfolio Value, Net P&L, Return %, Holdings/Trades, Reports, Journal (only if explicitly permitted — see Section 9). What a Client never sees, enforced server-side exactly like every other Viewer restriction already tested in Phase 9: other clients under the same manager, the manager's other unrelated accounts/portfolios, broker credentials, billing/subscription data, workspace administration, audit logs.

## 5. User / Workspace / Portfolio Model

```
User ──< WorkspaceMember >── Workspace ──< Portfolio >── PortfolioMember >── User (Client)
                                  │                │
                                  │                └──< TradingAccount (portfolio_id nullable)
                                  └──< TradingAccount (portfolio_id = NULL, solo trader case)
                                            │
                                            ├──< AccountMember >── User
                                            ├──< Invitation
                                            ├──< BrokerConnection
                                            └──< Trade (new — Phase 10.1)
```

Explicitly, per the user's own stated constraint: **User ≠ Trading Account**, **Client ≠ Trading Account**. One user can own many portfolios and many trading accounts; one portfolio can span multiple trading accounts. A `TradingAccount.portfolio_id` is nullable specifically so every account created before this phase (and every future solo-trader account) keeps working with no portfolio concept at all.

## 6. Trading Account / Trade Architecture (Phase 10.1 — build first)

New backend model, additive to `backend/app/models.py`:

```python
class Trade(Base):
    __tablename__ = "trades"
    id: str                     # UUID PK, same _uuid() pattern as every other table
    trading_account_id: str     # FK -> trading_accounts.id, indexed, cascade-deletes with the account
    trade_date: datetime
    segment: str
    script_name: str
    reason: str
    quantity: int
    side: str
    entry_price: float
    exit_date: datetime | None
    exit_price: float | None
    status: str
    gross_pnl: float
    net_pnl: float
    notes: str
    instrument_json: str | None   # optional MarketInstrument snapshot, mirrors today's Trade.instrument
    created_by_user_id: str       # FK -> users.id
    created_at: datetime
    updated_at: datetime
```

Field names deliberately mirror the existing Dexie `Trade` interface (`src/types/index.ts`) so the import step (Section 10) is a near-literal copy, not a transform.

API (`backend/app/routers/trades.py`, reusing the existing `require_account_member` gate — no new authorization concept):
- `GET /api/accounts/{id}/trades` — VIEWER+
- `POST /api/accounts/{id}/trades` — ADMIN+
- `PATCH /api/accounts/{id}/trades/{trade_id}` — ADMIN+
- `DELETE /api/accounts/{id}/trades/{trade_id}` — ADMIN+
- `POST /api/accounts/{id}/trades/bulk-import` — ADMIN+ (used once, at link time, to upload existing local trades; idempotent by trade `id`)

Every mutation logs `TRADE_CREATED` / `TRADE_UPDATED` / `TRADE_DELETED` / `TRADE_BULK_IMPORTED` via the existing `log_event` helper (`backend/app/audit.py`) — no new audit mechanism.

**Journal entries**: open question, not yet decided — either (a) journal stays exactly what it is today, the `notes` field on a `Trade`, requiring no new table, or (b) free-standing journal notes not tied to any one trade get their own `JournalEntry` table (`trading_account_id`, `entry_date`, `body`, `created_by_user_id`). Decide this at the start of Phase 10.1 based on whether "journal" needs to exist independently of trades in the shared/Client-visible view.

## 7. Client Sharing (Portfolio-level invitations)

Mirrors the existing Trading-Account invitation flow (`backend/app/routers/invitations.py`, Phase 5) exactly, one level up:

```
Portfolio → Access Management → Invite Client
  enter: client name, email
  select: Viewer (Clients are never invited as Admin/Owner)
  → Invitation (portfolio_id, email, role=VIEWER, status, expires_at)
Client signs up/logs in with that email → sees it under "Shared With Me"
Client accepts → gets a PortfolioMember row → can read every TradingAccount under that portfolio
Manager can revoke at any time → PortfolioMember deleted → access gone on the client's very next request
```

Reuses the existing `InvitationsInbox`/`ManageAccessPanel` UI patterns and the existing email-matching logic (an invitation is matched by lowercased email, not `user_id`, so it works for a client who hasn't signed up yet — unchanged from Phase 5).

## 8. Multi-Tenant Isolation

No workspace can access another workspace's data; no client sees another client's portfolio, even under the same manager. Enforced exactly as today: every account/portfolio-scoped read or write re-derives access from the authenticated user's own membership row (`require_account_member` / new `require_portfolio_member`) — never a raw `WHERE trading_account_id = :id` with no prior check, never a trusted frontend-supplied ID. 404 (not 403) when the requester has no membership at all, matching the existing "don't confirm a resource exists to a non-member" posture.

## 9. Authorization Model

- `require_portfolio_member(db, portfolio_id, user, min_role)` — new helper in `backend/app/authz.py`, identical shape to `require_account_member`/`require_workspace_member`: role-rank comparison, 404 for non-members, 403 for insufficient role.
- A Client's access to a specific `TradingAccount` is always resolved by: is there a `PortfolioMember` row for this user on `trading_account.portfolio_id`? — one codepath, reused by every trade/report/chart endpoint under that account, never a client-specific special case.
- Backend enforces every rule; the frontend hiding a button (e.g. not rendering "Users & Permissions" for a Viewer) is UX polish only, never the actual security boundary — consistent with every prior phase.

## 10. Migration Strategy (Dexie → backend, opt-in, non-destructive)

Unchanged in spirit from `ARCHITECTURE_PLAN.md` Section 12, now concrete now that a `Trade` table exists to migrate into:

1. User picks an existing local Dexie `Account`, clicks an explicit **"Enable sharing for this account"** action (new UI, not automatic).
2. Frontend creates (or picks) a backend `TradingAccount`, then calls `POST /api/accounts/{id}/trades/bulk-import` with every local `Trade` for that account.
3. A new local-only Dexie table `accountLinks` (`localAccountId ↔ backendAccountId`) records the link — an additive Dexie schema version bump; no existing table is touched or removed.
4. From then on, the three existing trade-mutation call sites in `App.tsx` (add, edit, delete — currently around lines 594/742/724) also fire a best-effort background sync to the backend if the current account is linked. Dexie remains the source of truth for the owner's own browser and offline use; the backend copy is what a Viewer/Client ever reads.
5. The local Dexie copy is **never deleted** by this flow — only by the user's own explicit action elsewhere in Settings, exactly as today.

## 11. Subscription / Entitlement Architecture

Replaces the current hardcoded `PLAN_LIMITS` dict in `backend/app/plans.py` with a DB-backed `Plan` table an admin can edit later, while keeping the existing `limits_for(plan_name)` function signature unchanged so no existing caller needs to change:

```python
class Plan(Base):
    id: str
    name: str                    # FREE | PRO | BUSINESS | (future) ENTERPRISE
    price_monthly: int           # paise/cents, DB-stored, never hardcoded in frontend
    price_quarterly: int
    price_yearly: int
    max_trading_accounts: int | None   # None = unlimited (matches today's BUSINESS tier)
    features_json: str
```

```python
class Subscription(Base):
    id: str
    workspace_id: str            # FK, one active subscription per workspace
    plan_id: str                 # FK
    razorpay_subscription_id: str | None
    status: str                  # ACTIVE | PAST_DUE | CANCELED | EXPIRED
    current_period_end: datetime
    created_at: datetime

class Payment(Base):
    id: str
    subscription_id: str         # FK
    razorpay_payment_id: str
    amount: int
    status: str
    created_at: datetime

class WebhookEvent(Base):
    id: str
    razorpay_event_id: str       # UNIQUE — the idempotency key
    event_type: str
    payload_json: str
    processed_at: datetime | None
```

**Downgrade safety** (explicit requirement): if a workspace downgrades and now has more Trading Accounts than the new plan allows, **nothing is deleted or archived automatically**. Only *new* account creation is blocked until the workspace is back under the limit — this is the same "informational usage, enforced only going forward" pattern already established for the FREE-tier seat limit in Phase 8, extended to account limits once Razorpay makes the limit real money rather than a manual PATCH.

## 12. Razorpay Architecture (test mode only, locally)

```
Frontend (Pricing/Billing page)
   │
   ▼
POST /api/billing/checkout {plan_id, cycle}
   │  backend creates a Razorpay Order (test mode), returns {order_id, key_id, amount}
   ▼
Razorpay Checkout.js (loaded from cdn.razorpay.com, frontend only ever holds the publishable key_id)
   │  user completes test-mode payment
   ▼
Frontend receives {razorpay_payment_id, razorpay_order_id, razorpay_signature}
   │
   ▼
POST /api/billing/verify {payment_id, order_id, signature}
   │  backend recomputes the HMAC signature with RAZORPAY_KEY_SECRET and compares —
   │  frontend can never claim "payment succeeded" on its own
   ▼
Razorpay webhook → POST /api/billing/webhook
   │  signature-verified (X-Razorpay-Signature header + webhook secret)
   │  WebhookEvent idempotency check FIRST (unique razorpay_event_id) — a replayed/duplicate
   │  delivery is a no-op, never double-applies a payment or extends a period twice
   ▼
Subscription + Plan entitlement updated
```

- `RAZORPAY_KEY_SECRET` and the webhook signing secret live only in backend env config (`app/config.py`, same `JOURNAL_`-prefixed pattern as every existing secret, e.g. `broker_encryption_key`) — **never** sent to the frontend, never logged, never in an error message.
- The frontend's Razorpay checkout script only ever sees the publishable `key_id`, which is safe to expose by design (that's what Checkout.js requires).
- Test mode only: the key pair used locally is Razorpay's own test-mode credentials, kept in `backend/.env` (gitignored, same as every other local secret today) — never live keys, never a production webhook URL, matching the explicit "no live Razorpay, no production payment" instruction.

## 13. Billing Lifecycle & Entitlements

- **Free signup** → Workspace on FREE plan → 1 trading account allowed (informational limit, per Phase 8's existing non-blocking-for-accounts policy — flagged as a decision point: the new master spec asks for a hard 1-account FREE cap, which conflicts with the earlier "no arbitrary trading-account limit" instruction from Phase 8. This conflict must be resolved explicitly with the user before Phase 10.3 (Razorpay) implementation — not silently decided either way.)
- **Attempting to exceed the plan's account entitlement** → clear over-limit UI state → link to `/pricing` → Razorpay checkout → `/verify` → `Subscription` activated → entitlement raised → account creation unblocked.
- **Billing page** shows: current plan, status, cycle, next billing date, accounts used / accounts limit, Upgrade / Manage Subscription actions.
- **Cancellation**: subscription `status` moves to `CANCELED` at period end (via webhook), plan reverts to FREE's entitlement, but per Section 11, no data is ever deleted.

## 14. Security

Everything already enforced in Phases 1–9 continues unchanged and extends to the new resources:
- Bcrypt password hashing, server-side revocable sessions, HTTP-only `SameSite=Lax` cookies (no JWT, no localStorage tokens).
- Centralized authorization (`authz.py`), never per-endpoint reimplementation, never a trusted frontend ID.
- Broker credentials: Fernet-encrypted at rest, never returned to a Viewer, never in plaintext anywhere, revealed only via one explicit, audited endpoint (Phase 7, unchanged).
- Razorpay secrets: same never-to-frontend, never-logged posture as broker credentials, using the same `encrypt_secret`/env-config pattern.
- Audit log: extended with `TRADE_*`, `PORTFOLIO_*`, `SUBSCRIPTION_*`, `PAYMENT_*`, `WEBHOOK_*` action constants — same `AuditLog` table, same append-only/`ON DELETE SET NULL` design (Phase 6, unchanged).

## 15. Database

All additions are additive migrations on top of the existing SQLite (Postgres-ready) schema — no existing table is renamed, dropped, or has a column removed. New tables: `trades`, optionally `journal_entries` (Section 6), `portfolios`, `portfolio_members`, `plans` (replacing the hardcoded dict), `subscriptions`, `payments`, `webhook_events`. Every new table follows the existing conventions in `backend/app/models.py`: `String(36)` UUID primary keys via the existing `_uuid()` helper, indexed foreign keys, `ON DELETE SET NULL` on anything an `AuditLog` row might reference, cascade deletes only where the child is meaningless without the parent (e.g., `Trade` cascades with its `TradingAccount`, `PortfolioMember` cascades with its `Portfolio`).

## 16. API Surface (new, additive)

| Endpoint | Access |
|---|---|
| `GET/POST/PATCH/DELETE /api/accounts/{id}/trades[/...]` | VIEWER (read) / ADMIN+ (write) |
| `POST /api/accounts/{id}/trades/bulk-import` | ADMIN+ |
| `GET/POST /api/portfolios`, `GET/PATCH/DELETE /api/portfolios/{id}` | Workspace ADMIN+ (create), Portfolio role-gated (read/write) |
| `GET/POST /api/portfolios/{id}/members`, `DELETE .../members/{id}` | Portfolio OWNER |
| `GET/POST /api/portfolios/{id}/invitations`, `DELETE .../invitations/{id}` | Portfolio OWNER |
| `GET /api/workspaces/{id}/billing` | Workspace member |
| `POST /api/billing/checkout` | Workspace OWNER |
| `POST /api/billing/verify` | Workspace OWNER |
| `POST /api/billing/webhook` | Public, but Razorpay-signature-verified (not user-authenticated — this is a server-to-server callback) |

## 17. Frontend Structure

- New dependency: a router (React Router), the first this app has needed — public site, SaaS app, and client portal become distinct route trees in one build.
- `src/marketing/` — new, self-contained, public site (Section 2), no dependency on `WorkspaceAuthContext` except linking into `AuthGate`.
- `src/workspace/BillingPage.tsx`, `src/workspace/PortfolioModal.tsx`, `src/workspace/ClientAccessPanel.tsx` — new, following the exact existing patterns (`ws-` CSS namespace, modal conventions) already established by `MyAccountsModal`/`ManageAccessPanel`/`InvitationsInbox` — not a new design system.
- `App.tsx` gets only the same kind of surgical, three-call-site edits already scoped for trade sync (Section 10) — no rewrite of the 2907-line file.

## 18. Testing Plan

Extends the existing Phase 9 pattern (pytest, `TestClient`, in-memory SQLite, the same fixture style in `backend/tests/conftest.py`) with:
- Trade CRUD respects the exact same VIEWER/ADMIN/OWNER rules already tested for accounts (reusing `require_account_member` means this is largely "does the existing test pattern apply to the new resource," not new authorization logic).
- Portfolio isolation: Client A cannot see Client B's portfolio under the same manager, even via a manually-supplied real ID (IDOR).
- Client sees only explicitly-shared accounts, never a manager's other portfolios.
- Razorpay signature verification: valid signature accepted, tampered/invalid signature rejected, replayed webhook event is a no-op (idempotency).
- Downgrade never deletes or archives accounts; only blocks *new* creation over the limit.
- Export scoping (once exports exist server-side) never crosses accounts/portfolios.
- Full acceptance scenario mirroring `test_phase9_final_acceptance.py`'s style: a portfolio manager creates a portfolio with 3 accounts, invites a client as Viewer, client sees exactly those 3 accounts' trades and nothing else, manager revokes, client immediately loses access.

## 19. Local Development

```
Browser → React/Vite (localhost:5173) → FastAPI (localhost:8000) → SQLite (journal_dev.db, local file)
                                              │
                                              └→ Razorpay TEST MODE only (test key_id/key_secret, no live credentials, no production webhook URL)
```

No AWS, no production database, no live Razorpay, no Vercel deploy — unchanged from every prior phase's standing instruction.

## 20. Future Production / AWS Notes (not implemented now)

When a production phase is explicitly requested: swap `DATABASE_URL` to a managed Postgres instance (RDS or equivalent — the schema is already Postgres-compatible per Phase 1's design), move file/attachment storage to S3 or equivalent object storage if attachments grow beyond a single-server disk, move secrets (`RAZORPAY_KEY_SECRET`, `broker_encryption_key`, webhook signing secret) into a real secrets manager (AWS Secrets Manager or equivalent) instead of `.env`, add monitoring/alerting and backups. **None of this is implemented or configured now** — this section exists only so the current design doesn't paint itself into a corner, per the explicit "AWS is a future target, do not deploy now" instruction.

---

## Explicit open questions / decisions needed before implementation

1. **Journal entries** (Section 6): resolved — stays as the `Trade.notes` field, no separate `JournalEntry` table, per the user's explicit choice.
2. **FREE plan account limit** (Section 13): resolved — the user confirmed trading-account creation should actually be capped per plan (FREE=3, PRO=15, PREMIUM=50, BUSINESS=unlimited), overriding the earlier "no arbitrary account limit" instruction from Phase 8. `enforce_trading_account_limit` (already present in `plans.py` since Phase 8, previously unused) is now wired into `POST /api/accounts` and returns `402` with an upgrade prompt once the workspace's plan limit is reached — tests updated accordingly (`test_account_isolation.py`, `test_plans.py`, `test_phase9_final_acceptance.py`).
3. **Platform Admin back-office** (mentioned in the original spec, Section 28): out of scope for Phases 10.1–10.4 above; flagged here as a distinct future phase (platform-wide user/workspace/plan/payment management, separate from workspace-level ADMIN) rather than assumed into any of the four confirmed phases.

## Deliverable status

This document and the "Phase 10+" section added to `ARCHITECTURE_PLAN.md` are the complete deliverable for this planning step. **No code has been written.** Per the confirmed build order, the next step (on approval) is Phase 10.1: the `Trade` backend model, its API, and the opt-in Dexie-to-backend sync — nothing else starts before that is done and verified.
