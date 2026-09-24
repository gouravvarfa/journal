import { useState } from 'react'
import { ApiError } from './api'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

/**
 * "Shared With Me" invitations inbox — matches the spec's flow exactly:
 * Person B signs up/logs in with the invited email and sees this,
 * independent of whether they had an account at invite time.
 */
export function InvitationsInbox({ onClose }: { onClose: () => void }) {
  const {
    myInvitations,
    acceptInvitation,
    declineInvitation,
    myPortfolioInvitations,
    acceptPortfolioInvitation,
    declinePortfolioInvitation,
  } = useWorkspaceAuth()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept(id: string): Promise<void> {
    setBusyId(id)
    setError(null)
    try {
      await acceptInvitation(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept the invitation.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDecline(id: string): Promise<void> {
    setBusyId(id)
    setError(null)
    try {
      await declineInvitation(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not decline the invitation.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleAcceptPortfolio(id: string): Promise<void> {
    setBusyId(id)
    setError(null)
    try {
      await acceptPortfolioInvitation(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept the invitation.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeclinePortfolio(id: string): Promise<void> {
    setBusyId(id)
    setError(null)
    try {
      await declinePortfolioInvitation(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not decline the invitation.')
    } finally {
      setBusyId(null)
    }
  }

  const totalCount = myInvitations.length + myPortfolioInvitations.length

  return (
    <div className="ws-modal-backdrop" onClick={onClose}>
      <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ws-modal-header">
          <div>
            <h2>Shared With Me</h2>
            <p className="ws-muted">Invitations waiting for you</p>
          </div>
          <button type="button" className="ws-close-btn" onClick={onClose}>×</button>
        </div>

        {error && <p className="ws-error">{error}</p>}

        {totalCount === 0 ? (
          <div className="ws-empty-state">
            <p>No pending invitations.</p>
          </div>
        ) : (
          <div className="ws-account-grid">
            {myInvitations.map((invitation) => (
              <div key={invitation.id} className="ws-account-card">
                <div className="ws-account-card-top">
                  <strong>{invitation.account_name}</strong>
                  <span className="ws-role-pill">{invitation.role}</span>
                </div>
                <p className="ws-muted">{invitation.broker_name || 'No broker set'}</p>
                <p className="ws-muted small">Invited by {invitation.invited_by_email}</p>
                <div className="ws-account-card-actions">
                  <button
                    type="button"
                    className="ws-primary-btn"
                    disabled={busyId === invitation.id}
                    onClick={() => void handleAccept(invitation.id)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="ws-secondary-btn"
                    disabled={busyId === invitation.id}
                    onClick={() => void handleDecline(invitation.id)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {myPortfolioInvitations.map((invitation) => (
              <div key={invitation.id} className="ws-account-card">
                <div className="ws-account-card-top">
                  <strong>{invitation.client_display_name || invitation.portfolio_name}</strong>
                  <span className="ws-role-pill">{invitation.role}</span>
                </div>
                <p className="ws-muted">Portfolio · {invitation.portfolio_name}</p>
                <p className="ws-muted small">Invited by {invitation.invited_by_email}</p>
                <div className="ws-account-card-actions">
                  <button
                    type="button"
                    className="ws-primary-btn"
                    disabled={busyId === invitation.id}
                    onClick={() => void handleAcceptPortfolio(invitation.id)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="ws-secondary-btn"
                    disabled={busyId === invitation.id}
                    onClick={() => void handleDeclinePortfolio(invitation.id)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
