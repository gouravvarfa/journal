from __future__ import annotations

import datetime as dt
from collections.abc import Generator

from fastapi import Depends, HTTPException, Request

from sqlalchemy.orm import Session as DBSession

from . import models
from .config import settings
from .database import SessionLocal


def get_db() -> Generator[DBSession, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(request: Request, db: DBSession = Depends(get_db)) -> models.User:
    """
    The one place a request is turned into "this is user X" — every
    protected route depends on this rather than reading the cookie itself.
    A missing/expired/unknown session token all fail the same way (401), so
    logout (which deletes the Session row) revokes access immediately: the
    very next request with that cookie hits the "session is None" branch.
    """
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = db.get(models.Session, token)
    if session is None or session.expires_at < dt.datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    user = db.get(models.User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return user
