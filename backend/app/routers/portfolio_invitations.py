from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from .. import models, schemas
from ..audit import AuditAction, log_event
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/portfolio-invitations", tags=["portfolio-invitations"])


def _pending_for_email(db: DBSession, email: str) -> list[models.PortfolioInvitation]:
    return list(
        db.scalars(
            select(models.PortfolioInvitation).where(
                models.PortfolioInvitation.email == email.lower(),
                models.PortfolioInvitation.status == models.InvitationStatus.PENDING,
                models.PortfolioInvitation.expires_at >= dt.datetime.utcnow(),
            )
        ).all()
    )


@router.get("/me", response_model=list[schemas.MyPortfolioInvitationOut])
def my_portfolio_invitations(
    db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> list[schemas.MyPortfolioInvitationOut]:
    invitations = _pending_for_email(db, user.email)
    return [
        schemas.MyPortfolioInvitationOut(
            id=i.id,
            portfolio_id=i.portfolio_id,
            portfolio_name=i.portfolio.name,
            client_display_name=i.portfolio.client_display_name,
            role=i.role.value,
            invited_by_email=i.invited_by.email,
            created_at=i.created_at,
            expires_at=i.expires_at,
        )
        for i in invitations
    ]


def _get_pending_invitation_for_user(db: DBSession, invitation_id: str, user: models.User) -> models.PortfolioInvitation:
    invitation = db.get(models.PortfolioInvitation, invitation_id)
    if invitation is None or invitation.email != user.email.lower():
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.status != models.InvitationStatus.PENDING:
        raise HTTPException(status_code=410, detail="This invitation is no longer pending")
    if invitation.expires_at < dt.datetime.utcnow():
        raise HTTPException(status_code=410, detail="This invitation has expired")
    return invitation


@router.post("/{invitation_id}/accept", response_model=schemas.PortfolioOut)
def accept_portfolio_invitation(
    invitation_id: str, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> schemas.PortfolioOut:
    invitation = _get_pending_invitation_for_user(db, invitation_id, user)

    existing = db.scalar(
        select(models.PortfolioMember).where(
            models.PortfolioMember.portfolio_id == invitation.portfolio_id,
            models.PortfolioMember.user_id == user.id,
        )
    )
    if existing is None:
        db.add(
            models.PortfolioMember(
                portfolio_id=invitation.portfolio_id,
                user_id=user.id,
                role=invitation.role,
                granted_by_user_id=invitation.invited_by_user_id,
            )
        )

    invitation.status = models.InvitationStatus.ACCEPTED
    db.add(invitation)
    log_event(
        db,
        action=AuditAction.PORTFOLIO_INVITATION_ACCEPTED,
        user_id=user.id,
        request=request,
        metadata={"portfolio_id": invitation.portfolio_id, "role": invitation.role.value},
    )
    db.commit()

    portfolio = db.get(models.Portfolio, invitation.portfolio_id)
    assert portfolio is not None
    account_count = len(
        db.scalars(select(models.TradingAccount.id).where(models.TradingAccount.portfolio_id == portfolio.id)).all()
    )
    return schemas.PortfolioOut(
        id=portfolio.id,
        workspace_id=portfolio.workspace_id,
        name=portfolio.name,
        client_display_name=portfolio.client_display_name,
        role=invitation.role.value,
        account_count=account_count,
        created_at=portfolio.created_at,
    )


@router.post("/{invitation_id}/decline", status_code=204)
def decline_portfolio_invitation(
    invitation_id: str, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> None:
    invitation = _get_pending_invitation_for_user(db, invitation_id, user)
    invitation.status = models.InvitationStatus.DECLINED
    db.add(invitation)
    log_event(
        db,
        action=AuditAction.PORTFOLIO_INVITATION_DECLINED,
        user_id=user.id,
        request=request,
        metadata={"portfolio_id": invitation.portfolio_id},
    )
    db.commit()
