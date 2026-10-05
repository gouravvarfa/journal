from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401 — imported so Base knows about them before create_all
from .config import settings
from .database import Base, engine
from .routers import accounts, auth, billing, broker, invitations, portfolio_invitations, portfolios, trades, workspaces

app = FastAPI(title="Trading Journal API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Dev convenience: also accept the page being opened from a private-LAN address (phone on the same Wi-Fi).
    allow_origin_regex=r"^https?://(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,  # required for the session cookie to be sent cross-port (5173 -> 8000)
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(accounts.router)
app.include_router(invitations.router)
app.include_router(broker.router)
app.include_router(trades.router)
app.include_router(portfolios.router)
app.include_router(portfolio_invitations.router)
app.include_router(billing.router)


@app.on_event("startup")
def on_startup() -> None:
    # Local-dev convenience only: creates any missing tables against
    # journal_dev.db. A real migration tool (Alembic) replaces this once
    # there's a schema to migrate, not just create.
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
