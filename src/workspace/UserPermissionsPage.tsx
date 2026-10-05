import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, workspaceApi, type AccountMemberApi, type InvitationApi, type TradingAccountApi } from './api'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

function formatDate(iso: string): string {
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

/**
 * Business → User and Permissions. Uses the existing per-account member and
 * invitation endpoints; the backend is the real gate (listing needs ADMIN+,
 * inviting/removing/cancelling needs OWNER), this page only decides what is
 * worth showing. No passwords are ever involved — an invitee signs up or
 * logs in with their own credentials and accepts from their Invitations.
 */
export function UserPermissionsPage({ account }: { account: TradingAccountApi }) {
  const { me } = useWorkspaceAuth()
  const canView = account.role === 'OWNER' || account.role === 'ADMIN'
  const canManage = account.role === 'OWNER'

  const [members, setMembers] = useState<AccountMemberApi[] | null>(null)
  const [invitations, setInvitations] = useState<InvitationApi[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (!canView) return
    setError(null)
    try {
      const [memberList, invitationList] = await Promise.all([
        workspaceApi.listMembers(account.id),
        workspaceApi.listInvitations(account.id),
      ])
      setMembers(memberList)
      setInvitations(invitationList)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load users.')
    }
  }, [account.id, canView])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSend(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSubmitting(true)
    setModalError(null)
    try {
      await workspaceApi.createInvitation(account.id, email.trim(), role)
      setModalOpen(false)
      setEmail('')
      setRole('VIEWER')
      setNotice('Invitation created. No email is sent: the person will see it under Invitations after logging in with that email.')
      await load()
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Could not send the invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(invitation: InvitationApi): Promise<void> {
    setBusyId(invitation.id)
    setError(null)
    try {
      await workspaceApi.revokeInvitation(account.id, invitation.id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel the invitation.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(member: AccountMemberApi): Promise<void> {
    if (!window.confirm(`Remove ${member.email} from this business account?`)) return
    setBusyId(member.id)
    setError(null)
    try {
      await workspaceApi.removeMember(account.id, member.id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the user.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="ws-users-page">
      <div className="ws-users-page-header">
        <div>
          <h2>User and Permissions</h2>
          <p className="ws-muted">Manage users, access and invitations for your business account.</p>
        </div>
        {canManage && (
          <button type="button" className="ws-primary-btn" onClick={() => { setModalError(null); setModalOpen(true) }}>
            + Send Invitation
          </button>
        )}
      </div>

      {!canView && <p className="ws-muted">You do not have permission to manage users for this business account.</p>}
      {error && <p className="ws-error">{error}</p>}
      {notice && <p className="ws-muted">{notice}</p>}

      {canView && (
        <>
          <h3>Users</h3>
          <div className="ws-users-table-wrap">
            <table className="ws-members-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members === null && !error && (
                  <tr>
                    <td colSpan={5} className="ws-muted">Loading…</td>
                  </tr>
                )}
                {members?.map((member) => (
                  <tr key={member.id}>
                    <td>{member.display_name}</td>
                    <td>{member.email}</td>
                    <td>{member.role}</td>
                    <td>Active</td>
                    <td>
                      {canManage && member.role !== 'OWNER' && member.email !== me?.user.email && (
                        <button type="button" className="ws-link-btn ws-danger-link" disabled={busyId === member.id} onClick={() => void handleRemove(member)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Pending Invitations</h3>
          <div className="ws-users-table-wrap">
            <table className="ws-members-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ws-muted">No pending invitations.</td>
                  </tr>
                )}
                {invitations?.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>{invitation.email}</td>
                    <td>{invitation.role}</td>
                    <td>{invitation.is_expired ? 'Expired' : 'Pending'}</td>
                    <td>{formatDate(invitation.created_at)}</td>
                    <td>
                      {canManage && (
                        <button type="button" className="ws-link-btn" disabled={busyId === invitation.id} onClick={() => void handleCancel(invitation)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalOpen && (
        <div className="ws-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ws-modal-header">
              <h2>Send Invitation</h2>
              <button type="button" className="ws-close-btn" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form className="ws-add-account-form" onSubmit={(e) => void handleSend(e)}>
              <label className="ws-field">
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Enter user's email address" />
              </label>
              <label className="ws-field">
                Role
                <select value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'VIEWER')}>
                  <option value="VIEWER">VIEWER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              {modalError && <p className="ws-error">{modalError}</p>}
              <div className="ws-business-form-actions">
                <button type="submit" className="ws-primary-btn" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send Invitation'}
                </button>
                <button type="button" className="ws-secondary-btn" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
