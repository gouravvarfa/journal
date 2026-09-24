# Trading Journal → Multi-Tenant SaaS: Architecture Plan

Status: **Audit + plan only. No implementation started.** Vercel deploy paused per instruction.

## 1. Current Architecture

The Trading Journal is a **100% client-side PWA** — there is no backend today.

- **Frontend**: React 19 + TypeScript + Vite, deployed as a static site to Vercel (`https://dist-nine-taupe-18.vercel.app`).
- **Data storage**: Dexie (IndexedDB) running **entirely in the browser**. Database name `journal-db`, tables: `accounts`, `trades`, `settings`, `attachments`, `brokerCredentials`, `cryptoKeys`, `instrumentCache`.
- **"Profile"**: a single free-text name string stored in the `settings` table — not an account, not a login, has no password, and is scoped to one browser/device only. Two people opening the app in two browsers see two entirely independent, unrelated datasets.
- **Accounts**: an `Account` row (`accountName`, `brokerName`, `accountType`, …) is just a labeled bucket for grouping trades — not tied to any user identity, because no user identity exists.
- **Trades**: a flat `Trade` table keyed by `accountId`. No workspace/user/tenant concept anywhere in the schema.
- **Broker credentials (Angel One)**: encrypted client-side with a non-extractable AES-GCM `CryptoKey` also stored in IndexedDB (documented in code as protecting against casual exposure only — explicitly not an XSS defense). Session tokens are held in memory only, never persisted.
- **The only server-side code that exists** is one Vercel Edge Function, `api/scrip-master.ts` — a stateless same-origin proxy that re-serves Angel One's public instrument list to dodge a CORS restriction. It has no database access, no auth, no concept of a user.
- **Exports** (Excel/PDF) and the TradingView Lightweight Charts v5.2 panel all run client-side against whatever is in the local IndexedDB.

## 2. Current Problems (relative to the multi-tenant SaaS requirement)

1. **No server-enforced anything.** Every security/authorization rule in this spec ("Viewer cannot edit," "User A cannot see User B's data," "revoked access is immediate") requires a trusted server to check *who is asking* and *what they're allowed to touch*. There is no server today — only a static file host and a browser database that will do exactly what the JavaScript running in that browser tells it to do. **Frontend-only authorization is not just weaker here — it is the *only* form of authorization that currently exists, and it is not real security.**
2. **No concept of a "user" at all**, let alone workspace/organization/roles. The "profile name" is cosmetic.
3. **Data lives in one browser.** IndexedDB does not sync between devices or people. Sharing "Account B, read-only, to Person X" is architecturally impossible without data leaving that browser — it has to move to a server both people's browsers can talk to.
4. **Broker credentials are encrypted with a key that also lives in the same browser's IndexedDB.** This is a reasonable mitigation for a single-user local-first app; it is not a server-side secret-management story, which the sharing model requires (a Viewer's browser must never be able to derive the Owner's broker secret even in principle).
5. **No audit trail** — nothing is logged anywhere durable; a browser tab closing loses everything not yet in IndexedDB.

**Bottom line: this is not a multi-tenant-ification of existing server logic — it is standing up a real backend, a real database, and real authentication from zero, then migrating the existing local-first client to talk to it.** That is a much bigger undertaking than "add a permissions table," and the plan below is sized accordingly.

## 3. Proposed Multi-Tenant Architecture

```
Platform
 └─ Workspace (one per signed-up customer/team, created at signup)
     ├─ WorkspaceMember (user_id, workspace_id, workspace_role: OWNER | ADMIN)
     ├─ TradingAccount (workspace_id, owner_user_id, name, broker, ...)
     │   ├─ AccountMember (trading_account_id, user_id, role: OWNER | ADMIN | VIEWER)
     │   ├─ Trade (trading_account_id, ...)
     │   ├─ JournalEntry / Attachment (trading_account_id, ...)
     │   ├─ BrokerConnection (trading_account_id, encrypted secrets, server-side only)
     │   └─ Invitation (trading_account_id, email, role, status, expires_at)
     └─ AuditLog (workspace_id, trading_account_id?, user_id, action, ...)
```

- **New backend service**: FastAPI (Python) + PostgreSQL + SQLAlchemy — this matches the stack already used by the separate `scanner` project, so it's a proven, known-good choice for this team, but it is built as its **own independent service** with its own database. It does not import from, depend on, or share a database with `scanner` or `algotrading` (per the absolute rule already in force for those two).
- **The existing React frontend is kept** — its component tree, chart panel (Lightweight Charts v5.2, unchanged), and export logic are reused. What changes is the *data layer*: instead of reading/writing Dexie directly, the app talks to the new backend's REST API. Dexie becomes an optional offline cache layer in a later phase, not the source of truth.
- Every table that holds user data carries `trading_account_id` (and transitively `workspace_id`), and **every read query is required to pass through a single authorization helper** (Section 9) before it's allowed to run — never a raw `WHERE trading_account_id = :id` with no access check.

## 4. Database Changes

New Postgres schema (illustrative column sets, not final DDL):

- `users` — id, email (unique), password_hash, created_at, is_active
- `workspaces` — id, name, owner_user_id, plan (`FREE|PRO|PREMIUM|BUSINESS`), created_at
- `workspace_members` — workspace_id, user_id, role (`OWNER|ADMIN`), joined_at
- `trading_accounts` — id, workspace_id, owner_user_id, name, broker_name, account_type, is_archived, created_at, updated_at
- `account_members` — trading_account_id, user_id, role (`OWNER|ADMIN|VIEWER`), granted_by, granted_at — **this table is the actual sharing/permission record**
- `trades` — same columns as today's `Trade`, plus `trading_account_id` FK (indexed), `created_by_user_id`
- `journal_entries` / `attachments` — same shape as today, `trading_account_id` FK
- `broker_connections` — trading_account_id FK, broker name, **encrypted** credential blob, key reference — never a plaintext column, never returned by any list/detail endpoint
- `invitations` — id, trading_account_id, email, role, status (`PENDING|ACCEPTED|EXPIRED|REVOKED`), invited_by, created_at, expires_at
- `audit_logs` — id, workspace_id, trading_account_id (nullable), user_id, action, metadata (jsonb), ip_address, created_at

Indexes: FK columns above, plus `(trading_account_id, trade_date)` on `trades` for the common list-by-date-range query, and `(user_id, trading_account_id)` unique on `account_members`.

## 5. Authentication Changes

- Email + password signup/login on the new backend. Passwords hashed with **bcrypt/argon2** (never reversible, never logged).
- Session model: **HTTP-only, Secure, SameSite cookies** holding a signed session token (or short-lived JWT + refresh token pair) — chosen over frontend-readable tokens specifically so an XSS bug can't exfiltrate the session the way it could with a `localStorage` token.
- Endpoints: `POST /auth/signup`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `GET /auth/me`.
- Forgot/reset password uses a single-use, time-limited token emailed to the user (needs an email-sending integration — flagged as an open dependency in Section 14).

## 6. Authorization Model

A single dependency, e.g. `require_account_access(trading_account_id, min_role)`, used by **every** account-scoped endpoint:

1. Load the authenticated user from the session (already done by a lower-level `get_current_user` dependency).
2. Query `account_members` for `(user_id, trading_account_id)`.
3. If no row → 404 (not 403 — never confirm an account ID exists to someone with no access to it).
4. If row's role rank < `min_role` → 403.
5. Otherwise return the account/role to the route handler.

Permission constants map 1:1 to the list in the spec (`trade:create`, `trade:edit`, `journal:delete`, `sharing:manage`, `broker:manage`, …), each pinned to a minimum role. This is the **only** place role logic is allowed to live — route handlers call the dependency, they never re-implement the check.

## 7. Sharing Model

- `account_members` *is* the sharing table — an OWNER creating an account gets an `OWNER` row automatically; inviting someone as Viewer creates an `invitations` row, and on acceptance a `VIEWER` row in `account_members`.
- Revoking access = deleting the `account_members` row. Because every request re-checks this table (Section 6), the very next request from that user is denied — no caching layer sits between the check and the data, so revocation is immediate, not "eventually."

## 8. Viewer Model

Enforced entirely server-side via Section 6's role-rank check — `VIEWER` is simply excluded from every mutating endpoint's minimum-role requirement. The frontend also hides edit/delete controls for a Viewer (Section 17), but that's UX polish; the same 403 fires from the API even if someone hand-crafts a request.

## 9. Broker Credential Security

- Credentials move from client-side Dexie encryption to **server-side storage**, encrypted at rest with a server-held key (e.g., a KMS-managed key or an application-level secret from environment config — never derived from anything the browser sends).
- No endpoint ever returns the plaintext secret — `GET` endpoints for a broker connection return only safe metadata (`broker_name`, masked account id, `connected_at`, status). The encrypted blob is write-only from the API's perspective.
- Only `OWNER`/`ADMIN` on that specific trading account may call connect/disconnect/reconfigure endpoints; `VIEWER` gets 403 on all of them, and the safe-metadata `GET` is the only broker-related call a Viewer can reach.

## 10. API Changes

All new — there is no existing API to version against except the one Edge Function proxy, which is kept as-is (still just proxies a public instrument list, needs no auth).

Endpoint categories (Section 22 of the request), applied to every route:

| Category | Examples |
|---|---|
| PUBLIC | `/auth/signup`, `/auth/login`, `/auth/forgot-password` |
| AUTHENTICATED | `/auth/me`, `/workspaces` (list mine) |
| OWNER/ADMIN (account-scoped) | trade/journal create-edit-delete, broker connect/disconnect, invite, revoke |
| VIEWER READ-ONLY (account-scoped) | trade/journal/report list+detail, chart data, analytics |

## 11. Frontend Changes

- Add a login/signup flow gating the whole app (today's onboarding modal, which just asks for a display name, is replaced by real auth).
- Replace direct Dexie reads/writes in `journalService.ts` etc. with calls to the new API client, scoped by the currently-selected `trading_account_id`.
- Add the global **Account Switcher** (header), **My Accounts** vs **Shared With Me** sections in the sidebar, and an account-level **Users & Permissions** settings page (Owner-only) — all as described in the spec, built on top of the existing design system already established for Settings/Broker Connections.
- Existing chart panel, indicators, drawing tools, and export code are **untouched in their internals** — they're re-pointed at API-sourced data instead of Dexie-sourced data.

## 12. Migration Strategy

The existing IndexedDB data is **per-device, per-browser, unauthenticated** — it cannot be "migrated" server-side sight-unseen, because the server has never seen it and doesn't know which human it belongs to. Proposed path:

1. Ship the backend + auth + workspace/account model (Phases 1–2) **without removing Dexie**.
2. Add a one-time, user-initiated **"Import my local journal"** flow: once logged in, the app reads the existing local `journal-db` (unchanged, untouched) and POSTs its accounts/trades/attachments to the new backend under a trading account the user creates, then marks that import complete. Nothing is deleted locally during this step.
3. Only after a successful import (verified by re-fetching from the API and comparing counts) does the app switch that browser over to API-backed mode. The local Dexie copy is left in place, untouched, as a backup — not wiped — until the user explicitly clears it later.
4. This makes migration **opt-in and per-browser**, avoids any server-side guessing about ownership of pre-existing local data, and guarantees zero data loss because nothing is ever deleted as part of the migration itself.

## 13. Security Test Plan

Backend test suite (pytest, mirroring the style already used in `scanner`'s test suite) covering, at minimum, the 14 cases listed in the request verbatim: cross-workspace access, cross-account access, Viewer write attempts (edit/delete/add trade, change settings, broker credentials, invite, change permissions), immediate effect of revocation, account data isolation, IDOR via manually-changed IDs, export scoping, and shared-Viewer scoping to only explicitly-shared accounts. Each test asserts a 403/404 at the API layer, not just an absence of a UI button.

## 14. Rollout Plan

Phased per Section 26 of the request; after each phase: run backend tests, run frontend build, manually verify existing journal features (add/edit trade, export, chart, Angel One connect) still work end-to-end, and confirm no local data was touched.

**Open dependency to flag now, not discover mid-build**: password-reset email requires an outbound email provider (e.g. Resend/SendGrid) and a domain to send from — this doesn't exist in the project today and needs a decision (which provider, whose account) before Phase 1's "forgot password" can be completed. Everything else in Phase 1 has no external dependency.

**Hosting note**: the new backend needs a real, always-on host with a Postgres database (Vercel's own serverless functions are not a good fit for a stateful session+DB backend of this shape) — Railway/Render/Fly.io/a small VPS are the usual choices; this is a decision for you, not something to default silently.

---

## Phases 1–9: Status — Complete (local dev only)

Phases 1–9 above were implemented and tested locally (FastAPI + SQLite, Postgres-compatible by a one-line config change): real bcrypt auth with server-side revocable sessions, `Workspace`/`TradingAccount`/`AccountMember`/`Invitation` with a single reusable `require_account_member`/`require_workspace_member` authorization gate, an append-only `AuditLog`, server-side encrypted `BrokerConnection` storage (Fernet, never exposed to Viewers or in plaintext), and a `plans.py` entitlement layer (FREE/PRO/PREMIUM/BUSINESS) — 76 backend tests and 38 frontend tests passing, no Vercel/AWS deploy attempted, per the standing instruction. See `backend/app/` and `src/workspace/` for the implementation, and the test files under `backend/tests/` (particularly `test_phase9_final_acceptance.py`) for the verified end-to-end acceptance scenario.

**Known gap surfaced by real use**: none of Phases 1–9 built a `Trade` model. Sharing a `TradingAccount` therefore shares an empty container — the invited Viewer sees no trades, because trades still exist only in the *owner's own browser's* Dexie database (Section 1 above). This is the problem Phase 10 below exists to fix.

## Phase 10+: Commercial SaaS Expansion

The product scope has expanded from "multi-tenant trading journal" to a sellable SaaS platform: real trade data behind sharing, a Portfolio/Client layer for portfolio managers, a read-only Client Portal, Razorpay subscription billing (test mode, local only), and a public marketing website. Full detail — data model, API surface, Razorpay flow, client portal design, public site structure, and testing plan — is in **[`BUSINESS_SAAS_ARCHITECTURE.md`](./BUSINESS_SAAS_ARCHITECTURE.md)**, not duplicated here.

**Confirmed build order** (documentation covers all four; implementation proceeds one at a time, each verified with backend tests + frontend build before the next starts, matching the Phase 1–9 discipline):

1. **Trade backend + sync** — add the missing `Trade` model, wire it into the existing `require_account_member` authorization, connect it to the existing Dexie trade-mutation call sites via an opt-in "enable sharing" link + best-effort background sync. This is what makes sharing show real data.
2. **Portfolio/Client layer** — `Portfolio`/`PortfolioMember` sit between `Workspace` and `TradingAccount`, giving a portfolio manager one invite that grants read access to every account under a client's portfolio.
3. **Razorpay billing** — test-mode-only subscription checkout, backend-verified payment (never trust frontend success), webhook idempotency, DB-backed `Plan`/`Subscription`/`Payment` replacing the hardcoded `PLAN_LIMITS` dict.
4. **Public marketing website** — `/`, `/features`, `/for-traders`, `/for-portfolio-managers`, `/pricing`, `/security`, `/about`, `/contact`, visually distinct from the app, introducing the project's first router.

Status: **documentation only, as instructed — no code written for Phase 10+ yet.** Waiting for approval to begin Phase 10.1 (Trade backend + sync).

Once confirmed, Phase 1 implementation begins.
