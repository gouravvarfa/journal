from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from .. import models, schemas
from ..audit import AuditAction, log_event
from ..authz import require_account_member
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/accounts", tags=["trades"])


def _out(trade: models.Trade) -> schemas.TradeOut:
    return schemas.TradeOut(
        id=trade.id,
        trading_account_id=trade.trading_account_id,
        trade_date=trade.trade_date,
        segment=trade.segment,
        script_name=trade.script_name,
        reason=trade.reason,
        quantity=trade.quantity,
        side=trade.side,
        entry_price=trade.entry_price,
        exit_date=trade.exit_date,
        exit_price=trade.exit_price,
        status=trade.status,
        gross_pnl=trade.gross_pnl,
        net_pnl=trade.net_pnl,
        notes=trade.notes,
        instrument_json=trade.instrument_json,
        created_at=trade.created_at,
        updated_at=trade.updated_at,
    )


def _get_trade(db: DBSession, trading_account_id: str, trade_id: str) -> models.Trade:
    trade = db.scalar(
        select(models.Trade).where(models.Trade.id == trade_id, models.Trade.trading_account_id == trading_account_id)
    )
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade


@router.get("/{trading_account_id}/trades", response_model=list[schemas.TradeOut])
def list_trades(
    trading_account_id: str, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> list[schemas.TradeOut]:
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.VIEWER)
    trades = db.scalars(
        select(models.Trade).where(models.Trade.trading_account_id == trading_account_id).order_by(models.Trade.trade_date.desc())
    ).all()
    return [_out(t) for t in trades]


@router.post("/{trading_account_id}/trades", response_model=schemas.TradeOut, status_code=201)
def create_trade(
    trading_account_id: str,
    payload: schemas.TradeCreate,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> schemas.TradeOut:
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.ADMIN)

    trade_kwargs = dict(
        trading_account_id=trading_account_id,
        trade_date=payload.trade_date,
        segment=payload.segment,
        script_name=payload.script_name,
        reason=payload.reason,
        quantity=payload.quantity,
        side=payload.side,
        entry_price=payload.entry_price,
        exit_date=payload.exit_date,
        exit_price=payload.exit_price,
        status=payload.status,
        gross_pnl=payload.gross_pnl,
        net_pnl=payload.net_pnl,
        notes=payload.notes,
        instrument_json=payload.instrument_json,
        created_by_user_id=user.id,
    )
    # Explicit id (from the client-generated Dexie trade), when given, lets
    # a create that arrives twice from a flaky sync collapse onto one row
    # instead of duplicating — the primary key does the deduplication, no
    # separate idempotency table needed. Omitted entirely (not passed as
    # None) so the column's own UUID default fires normally otherwise.
    if payload.id:
        trade_kwargs["id"] = payload.id
    trade = models.Trade(**trade_kwargs)

    db.add(trade)
    db.flush()
    log_event(
        db,
        action=AuditAction.TRADE_CREATED,
        user_id=user.id,
        trading_account_id=trading_account_id,
        request=request,
        metadata={"trade_id": trade.id, "script_name": trade.script_name},
    )
    db.commit()
    db.refresh(trade)
    return _out(trade)


@router.patch("/{trading_account_id}/trades/{trade_id}", response_model=schemas.TradeOut)
def update_trade(
    trading_account_id: str,
    trade_id: str,
    payload: schemas.TradeUpdate,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> schemas.TradeOut:
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.ADMIN)
    trade = _get_trade(db, trading_account_id, trade_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(trade, field, value)

    db.add(trade)
    log_event(
        db,
        action=AuditAction.TRADE_UPDATED,
        user_id=user.id,
        trading_account_id=trading_account_id,
        request=request,
        metadata={"trade_id": trade.id},
    )
    db.commit()
    db.refresh(trade)
    return _out(trade)


@router.delete("/{trading_account_id}/trades/{trade_id}", status_code=204)
def delete_trade(
    trading_account_id: str,
    trade_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> None:
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.ADMIN)
    trade = _get_trade(db, trading_account_id, trade_id)

    log_event(
        db,
        action=AuditAction.TRADE_DELETED,
        user_id=user.id,
        trading_account_id=trading_account_id,
        request=request,
        metadata={"trade_id": trade.id, "script_name": trade.script_name},
    )
    db.delete(trade)
    db.commit()


@router.post("/{trading_account_id}/trades/bulk-import", response_model=schemas.TradeBulkImportOut, status_code=201)
def bulk_import_trades(
    trading_account_id: str,
    payload: schemas.TradeBulkImportRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> schemas.TradeBulkImportOut:
    """
    ADMIN+. Used once, at "enable sharing" time, to upload a batch of
    existing local (Dexie) trades. Idempotent by id: re-running an import
    (e.g. a retried request) never duplicates a trade that already made it
    across — it's silently skipped, not overwritten, since a real edit
    should go through PATCH, not a re-import.
    """
    require_account_member(db, trading_account_id, user, min_role=models.AccountRole.ADMIN)

    existing_ids = {
        row
        for row in db.scalars(
            select(models.Trade.id).where(models.Trade.trading_account_id == trading_account_id)
        ).all()
    }

    imported = 0
    skipped = 0
    for item in payload.trades:
        if item.id and item.id in existing_ids:
            skipped += 1
            continue
        item_kwargs = dict(
            trading_account_id=trading_account_id,
            trade_date=item.trade_date,
            segment=item.segment,
            script_name=item.script_name,
            reason=item.reason,
            quantity=item.quantity,
            side=item.side,
            entry_price=item.entry_price,
            exit_date=item.exit_date,
            exit_price=item.exit_price,
            status=item.status,
            gross_pnl=item.gross_pnl,
            net_pnl=item.net_pnl,
            notes=item.notes,
            instrument_json=item.instrument_json,
            created_by_user_id=user.id,
        )
        if item.id:
            item_kwargs["id"] = item.id
        trade = models.Trade(**item_kwargs)
        db.add(trade)
        if item.id:
            existing_ids.add(item.id)
        imported += 1

    log_event(
        db,
        action=AuditAction.TRADE_BULK_IMPORTED,
        user_id=user.id,
        trading_account_id=trading_account_id,
        request=request,
        metadata={"imported": imported, "skipped_existing": skipped},
    )
    db.commit()
    return schemas.TradeBulkImportOut(imported=imported, skipped_existing=skipped)
