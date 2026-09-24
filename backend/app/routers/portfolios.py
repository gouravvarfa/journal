from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from .. import models, schemas
from ..audit import AuditAction, log_event
from ..authz import require_portfolio_member, require_workspace_member
from ..config import settings
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/portfolios", tags=["portfolios"])


def _out(portfolio: models.Portfolio, role: models.AccountRole, account_count: int) -> schemas.PortfolioOut:
    return schemas.PortfolioOut(
        id=portfolio.id,
        workspace_id=portfolio.workspace_id,
        name=portfolio.name,
        client_display_name=portfolio.client_display_name,
        role=role.value,
        account_count=account_count,
        created_at=portfolio.created_at,
    )


def _account_count(db: DBSession, portfolio_id: str) -> int:
    return len(
        db.scalars(select(models.TradingAccount.id).where(models.TradingAccount.portfolio_id == portfolio_id)).all()
    )


@router.post("", response_model=schemas.PortfolioOut, status_code=201)
def create_portfolio(
    payload: schemas.PortfolioCreate, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> schemas.PortfolioOut:
    require_workspace_member(db, payload.workspace_id, user, min_role=models.WorkspaceRole.ADMIN)

    portfolio = models.Portfolio(
        workspace_id=payload.workspace_id,
        name=payload.name,
        owner_user_id=user.id,
        client_display_name=payload.client_display_name,
    )
    db.add(portfolio)
    db.flush()

    db.add(models.PortfolioMember(portfolio_id=portfolio.id, user_id=user.id, role=models.AccountRole.OWNER))
    log_event(
        db,
        action=AuditAction.PORTFOLIO_CREATED,
        user_id=user.id,
        workspace_id=portfolio.workspace_id,
        request=request,
        metadata={"name": portfolio.name, "portfolio_id": portfolio.id},
    )
    db.commit()
    db.refresh(portfolio)
    return _out(portfolio, models.AccountRole.OWNER, 0)


@router.get("", response_model=list[schemas.PortfolioOut])
def list_my_portfolios(
    workspace_id: str | None = None, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> list[schemas.PortfolioOut]:
    memberships = db.scalars(select(models.PortfolioMember).where(models.PortfolioMember.user_id == user.id)).all()
    return [
        _out(m.portfolio, m.role, _account_count(db, m.portfolio_id))
        for m in memberships
        if workspace_id is None or m.portfolio.workspace_id == workspace_id
    ]


@router.get("/{portfolio_id}", response_model=schemas.PortfolioOut)
def get_portfolio(
    portfolio_id: str, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> schemas.PortfolioOut:
    membership = require_portfolio_member(db, portfolio_id, user, min_role=models.AccountRole.VIEWER)
    return _out(membership.portfolio, membership.role, _account_count(db, portfolio_id))


@router.patch("/{portfolio_id}", response_model=schemas.PortfolioOut)
def update_portfolio(
    portfolio_id: str,
    payload: schemas.PortfolioUpdate,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> schemas.PortfolioOut:
    membership = require_portfolio_member(db, portfolio_id, user, min_role=models.AccountRole.ADMIN)
    portfolio = membership.portfolio

    if payload.name is not None:
        portfolio.name = payload.name
    if payload.client_display_name is not None:
        portfolio.client_display_name = payload.client_display_name

    db.add(portfolio)
    log_event(
        db,
        action=AuditAction.PORTFOLIO_UPDATED,
        user_id=user.id,
        workspace_id=portfolio.workspace_id,
        request=request,
        metadata={"portfolio_id": portfolio.id},
    )
    db.commit()
    db.refresh(portfolio)
    return _out(portfolio, membership.role, _account_count(db, portfolio_id))


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(
    portfolio_id: str, request: Request, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> None:
    # OWNER only. Deleting a Portfolio never deletes its TradingAccounts —
    # the FK is ON DELETE SET NULL, so every account just becomes
    # unassigned (solo again), matching "never auto-delete financial data."
    membership = require_portfolio_member(db, portfolio_id, user, min_role=models.AccountRole.OWNER)
    portfolio = membership.portfolio
    log_event(
        db,
        action=AuditAction.PORTFOLIO_DELETED,
        user_id=user.id,
        workspace_id=portfolio.workspace_id,
        request=request,
        metadata={"name": portfolio.name, "portfolio_id": portfolio.id},
    )
    db.delete(portfolio)
    db.commit()


def _member_out(member: models.PortfolioMember) -> schemas.PortfolioMemberOut:
    return schemas.PortfolioMemberOut(
        id=member.id,
        user_id=member.user_id,
        email=member.user.email,
        display_name=member.user.display_name,
        role=member.role.value,
        granted_at=member.granted_at,
    )


@router.get("/{portfolio_id}/members", response_model=list[schemas.PortfolioMemberOut])
def list_portfolio_members(
    portfolio_id: str, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> list[schemas.PortfolioMemberOut]:
    require_portfolio_member(db, portfolio_id, user, min_role=models.AccountRole.ADMIN)
    members = db.scalars(select(models.PortfolioMember).where(models.PortfolioMember.portfolio_id == portfolio_id)).all()
    return [_member_out(m) for m in members]


@router.delete("/{portfolio_id}/members/{member_id}", status_code=204)
def remove_portfolio_member(
    portfolio_id: str,
    member_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> None:
    require_portfolio_member(db, portfolio_id, user, min_role=models.AccountRole.OWNER)
    member = db.scalar(
        select(models.PortfolioMember).where(
            models.PortfolioMember.id == member_id, models.PortfolioMember.portfolio_id == portfolio_id
        )
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.role == models.AccountRole.OWNER:
        owners = db.scalars(
            select(models.PortfolioMember).where(
                models.PortfolioMember.portfolio_id == portfolio_id,
                models.PortfolioMember.role == models.AccountRole.OWNER,
            )
        ).all()
        if len(owners) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner of a portfolio")

    log_event(
        db,
        action=AuditAction.PORTFOLIO_MEMBER_REMOVED,
        user_id=user.id,
        request=request,
        metadata={"portfolio_id": portfolio_id, "role": member.role.value},
    )
    db.delete(member)
    db.commit()


def _invitation_out(invitation: models.PortfolioInvitation) -> schemas.PortfolioInvitationOut:
    return schemas.PortfolioInvitationOut(
        id=invitation.id,
        portfolio_id=invitation.portfolio_id,
        email=invitation.email,
        role=invitation.role.value,
        status=invitation.status.value,
        invited_by_email=invitation.invited_by.email,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        is_expired=invitation.status == models.InvitationStatus.PENDING and invitation.expires_at < dt.datetime.utcnow(),
    )


@router.get("/{portfolio_id}/invitations", response_model=list[schemas.PortfolioInvitationOut])
def list_portfolio_invitations(
    portfolio_id: str, db: DBSession = Depends(get_db), user: models.User = Depends(get_current_user)
) -> list[schemas.PortfolioInvitationOut]:
    require_portfolio_member(db, portfolio_id, user, min_role=models.AccountRole.ADMIN)
    invitations = db.scalars(
        select(models.PortfolioInvitation).where(
            models.PortfolioInvitation.portfolio_id == portfolio_id,
            models.PortfolioInvitation.status == models.InvitationStatus.PENDING,
        )
    ).all()
    return [_invitation_out(i) for i in invitations]


@router.post("/{portfolio_id}/invitations", response_model=schemas.PortfolioInvitationOut, status_code=201)
def create_portfolio_invitation(
    portfolio_id: str,
    payload: schemas.PortfolioInvitationCreate,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> schemas.PortfolioInvitationOut:
    require_portfolio_member(db, portfolio_id, user, min_role=models.AccountRole.OWNER)
    email = payload.email.lower()

    existing_member = db.scalar(
        select(models.PortfolioMember)
        .join(models.User, models.PortfolioMember.user_id == models.User.id)
        .where(models.PortfolioMember.portfolio_id == portfolio_id, models.User.email == email)
    )
    if existing_member is not None:
        raise HTTPException(status_code=409, detail="That person already has access to this portfolio")

    existing_invite = db.scalar(
        select(models.PortfolioInvitation).where(
            models.PortfolioInvitation.portfolio_id == portfolio_id,
            models.PortfolioInvitation.email == email,
            models.PortfolioInvitation.status == models.InvitationStatus.PENDING,
        )
    )
    if existing_invite is not None and existing_invite.expires_at >= dt.datetime.utcnow():
        raise HTTPException(status_code=409, detail="An invitation is already pending for that email")

    invitation = models.PortfolioInvitation(
        portfolio_id=portfolio_id,
        email=email,
        role=models.AccountRole(payload.role),
        invited_by_user_id=user.id,
        expires_at=dt.datetime.utcnow() + dt.timedelta(days=settings.invitation_ttl_days),
    )
    db.add(invitation)
    log_event(
        db,
        action=AuditAction.PORTFOLIO_INVITATION_CREATED,
        user_id=user.id,
        request=request,
        metadata={"portfolio_id": portfolio_id, "email": email, "role": invitation.role.value},
    )
    db.commit()
    db.refresh(invitation)
    return _invitation_out(invitation)


@router.delete("/{portfolio_id}/invitations/{invitation_id}", status_code=204)
def revoke_portfolio_invitation(
    portfolio_id: str,
    invitation_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> None:
    require_portfolio_member(db, portfolio_id, user, min_role=models.AccountRole.OWNER)
    invitation = db.scalar(
        select(models.PortfolioInvitation).where(
            models.PortfolioInvitation.id == invitation_id, models.PortfolioInvitation.portfolio_id == portfolio_id
        )
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    invitation.status = models.InvitationStatus.REVOKED
    db.add(invitation)
    log_event(
        db,
        action=AuditAction.PORTFOLIO_INVITATION_REVOKED,
        user_id=user.id,
        request=request,
        metadata={"portfolio_id": portfolio_id, "email": invitation.email},
    )
    db.commit()
