from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from .. import models, schemas, security
from ..audit import AuditAction, log_event
from ..authz import require_account_member
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/accounts", tags=["broker"])


def _get_connection(db: DBSession, trading_account_id: str) -> models.BrokerConnection | None:
    return db.scalar(
        select(models.BrokerConnection).where(models.BrokerConnection.trading_account_id == trading_account_id)
    )


@router.get("/{trading_account_id}/broker-status", response_model=schemas.BrokerStatusOut)
def get_broker_status(
    trading_account_id: str, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> schemas.BrokerStatusOut:
    """
    VIEWER+ — this is the one broker-related read a Viewer is allowed:
    "is something connected", never the credentials or full client code.
    """
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.VIEWER)
    connection = _get_connection(db, trading_account_id)
    if connection is None:
        return schemas.BrokerStatusOut(is_connected=False, broker_name=None, masked_client_code=None, updated_at=None)
    return schemas.BrokerStatusOut(
        is_connected=True,
        broker_name=connection.broker_name,
        masked_client_code=connection.client_code_masked,
        updated_at=connection.updated_at,
    )


@router.put("/{trading_account_id}/broker-credentials", response_model=schemas.BrokerStatusOut, status_code=201)
def save_broker_credentials(
    trading_account_id: str,
    payload: schemas.BrokerCredentialsUpsert,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> schemas.BrokerStatusOut:
    """
    OWNER/ADMIN only. Upserts — a second save replaces the stored
    credentials entirely rather than patching individual fields, so there
    is never a moment where an old and a new secret are both live for the
    same field. Plaintext values from `payload` are never logged, echoed
    back, or written anywhere except into the encrypted columns below.
    """
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.ADMIN)

    connection = _get_connection(db, trading_account_id)
    if connection is None:
        connection = models.BrokerConnection(trading_account_id=trading_account_id, updated_by_user_id=user.id)

    connection.broker_name = payload.broker_name
    connection.client_code_masked = security.mask_identifier(payload.client_code)
    connection.encrypted_api_key = security.encrypt_secret(payload.api_key)
    connection.encrypted_client_code = security.encrypt_secret(payload.client_code)
    connection.encrypted_pin = security.encrypt_secret(payload.pin)
    connection.encrypted_totp_secret = security.encrypt_secret(payload.totp_secret)
    connection.updated_by_user_id = user.id

    db.add(connection)
    log_event(
        db,
        action=AuditAction.BROKER_CREDENTIALS_SAVED,
        user_id=user.id,
        trading_account_id=trading_account_id,
        request=request,
        metadata={"broker_name": payload.broker_name},
    )
    db.commit()
    db.refresh(connection)

    return schemas.BrokerStatusOut(
        is_connected=True,
        broker_name=connection.broker_name,
        masked_client_code=connection.client_code_masked,
        updated_at=connection.updated_at,
    )


@router.get("/{trading_account_id}/broker-credentials/reveal", response_model=schemas.BrokerCredentialsRevealOut)
def reveal_broker_credentials(
    trading_account_id: str, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> schemas.BrokerCredentialsRevealOut:
    """
    OWNER/ADMIN only. This is the single place decrypted secrets ever leave
    the database — the frontend calls it immediately before driving a live
    broker connect (the SmartAPI login itself still happens from the
    browser, matching the existing Angel One integration), never caching
    the result anywhere persistent. Every call is audited.
    """
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.ADMIN)
    connection = _get_connection(db, trading_account_id)
    if connection is None:
        raise HTTPException(status_code=404, detail="No broker connection configured for this account")

    log_event(
        db,
        action=AuditAction.BROKER_CREDENTIALS_REVEALED,
        user_id=user.id,
        trading_account_id=trading_account_id,
        request=request,
        metadata={"broker_name": connection.broker_name},
    )
    db.commit()

    return schemas.BrokerCredentialsRevealOut(
        broker_name=connection.broker_name,
        api_key=security.decrypt_secret(connection.encrypted_api_key),
        client_code=security.decrypt_secret(connection.encrypted_client_code),
        pin=security.decrypt_secret(connection.encrypted_pin),
        totp_secret=security.decrypt_secret(connection.encrypted_totp_secret),
    )


@router.delete("/{trading_account_id}/broker-credentials", status_code=204)
def delete_broker_credentials(
    trading_account_id: str, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> None:
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.ADMIN)
    connection = _get_connection(db, trading_account_id)
    if connection is None:
        raise HTTPException(status_code=404, detail="No broker connection configured for this account")

    log_event(
        db,
        action=AuditAction.BROKER_CREDENTIALS_DELETED,
        user_id=user.id,
        trading_account_id=trading_account_id,
        request=request,
        metadata={"broker_name": connection.broker_name},
    )
    db.delete(connection)
    db.commit()
