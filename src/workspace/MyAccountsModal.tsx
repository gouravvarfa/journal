import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, workspaceApi, type PortfolioApi, type TradingAccountApi } from './api'
import { useWorkspaceAuth } from './WorkspaceAuthContext'
import { ManageAccessPanel } from './ManageAccessPanel'
import { LinkLocalAccountPanel } from './LinkLocalAccountPanel'

export function MyAccountsModal({ onClose }: { onClose: () => void }) {
  const { accounts, accountsLoading, accountsError, currentAccountId, createAccount, currentWorkspace, refreshAccounts } =
    useWorkspaceAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [broker, setBroker] = useState('')
  const [accountType, setAccountType] = useState('Trading')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [manageAccessFor, setManageAccessFor] = useState<TradingAccountApi | null>(null)
  const [linkDataFor, setLinkDataFor] = useState<TradingAccountApi | null>(null)
  const [portfolios, setPortfolios] = useState<PortfolioApi[]>([])
  const [portfolioBusyId, setPortfolioBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (currentWorkspace) {
      void workspaceApi.listPortfolios(currentWorkspace.id).then(setPortfolios).catch(() => {})
    }
  }, [currentWorkspace])

  async function handleAssignPortfolio(account: TradingAccountApi, portfolioId: string): Promise<void> {
    setPortfolioBusyId(account.id)
    try {
      await workspaceApi.assignAccountToPortfolio(account.id, portfolioId || null)
      await refreshAccounts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the portfolio for this account.')
    } finally {
      setPortfolioBusyId(null)
    }
  }
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null)

  async function handleAdd(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createAccount(name, broker, accountType)
      setName('')
      setBroker('')
      setAccountType('Trading')
      setShowAdd(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(account: TradingAccountApi): Promise<void> {
    if (!window.confirm(`Delete "${account.name}"? This cannot be undone.`)) {
      return
    }
    setBusyAccountId(account.id)
    try {
      await workspaceApi.deleteAccount(account.id)
      await refreshAccounts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the account.')
    } finally {
      setBusyAccountId(null)
    }
  }

  function renderCard(account: TradingAccountApi) {
    // Backend re-checks every one of these on every request — this is only
    // what decides which buttons are worth showing, never what actually
    // allows the action.
    const canDelete = account.role === 'OWNER'
    const busy = busyAccountId === account.id

    return (
      <div key={account.id} className={`ws-account-card ${account.id === currentAccountId ? 'active' : ''}`}>
        <div className="ws-account-card-top">
          <strong>{account.name}</strong>
          <span className="ws-role-pill">{account.role}</span>
        </div>
        <p className="ws-muted">{account.broker_name || 'No broker set'} · {account.account_type}</p>
        <p className="ws-muted small">{account.is_archived ? 'Archived' : 'Active'}</p>

        <div className="ws-account-card-actions">
          {canDelete && (
            <button type="button" className="ws-link-btn ws-danger-link" disabled={busy} onClick={() => void handleDelete(account)}>
              Delete
            </button>
          )}
        </div>

        {account.role === 'OWNER' && portfolios.length > 0 && (
          <label className="ws-field small" style={{ marginTop: 8 }}>
            Portfolio
            <select
              value={account.portfolio_id ?? ''}
              disabled={portfolioBusyId === account.id}
              onChange={(e) => void handleAssignPortfolio(account, e.target.value)}
            >
              <option value="">No portfolio (solo account)</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>{p.client_display_name || p.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    )
  }

  const myAccounts = accounts.filter((a) => a.workspace_id === currentWorkspace?.id)
  const sharedAccounts = accounts.filter((a) => a.workspace_id !== currentWorkspace?.id)

  return (
    <>
      <div className="ws-modal-backdrop" onClick={onClose}>
        <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="ws-modal-header">
            <div>
              <h2>My Trading Accounts</h2>
              {currentWorkspace && <p className="ws-muted">{currentWorkspace.name}</p>}
            </div>
            <button type="button" className="ws-close-btn" onClick={onClose}>×</button>
          </div>

          {accountsError && <p className="ws-error">{accountsError}</p>}
          {error && <p className="ws-error">{error}</p>}
          {accountsLoading && <p className="ws-muted">Loading accounts…</p>}

          {!accountsLoading && accounts.length === 0 && !showAdd && (
            <div className="ws-empty-state">
              <p>No trading accounts yet.</p>
            </div>
          )}

          {myAccounts.length > 0 && (
            <>
              <h3 className="ws-section-title">My Accounts</h3>
              <div className="ws-account-grid">{myAccounts.map(renderCard)}</div>
            </>
          )}

          {sharedAccounts.length > 0 && (
            <>
              <h3 className="ws-section-title">Shared With Me</h3>
              <div className="ws-account-grid">{sharedAccounts.map(renderCard)}</div>
            </>
          )}

          {showAdd ? (
            <form className="ws-add-account-form" onSubmit={(e) => void handleAdd(e)}>
              <label className="ws-field">
                Account name
                <input value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={200} placeholder="e.g. Gaurav - Angel One" />
              </label>
              <label className="ws-field">
                Broker
                <input value={broker} onChange={(e) => setBroker(e.target.value)} maxLength={120} placeholder="e.g. Angel One" />
              </label>
              <label className="ws-field">
                Type
                <input value={accountType} onChange={(e) => setAccountType(e.target.value)} maxLength={60} />
              </label>
              <div className="ws-modal-actions">
                <button type="button" className="ws-secondary-btn" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="ws-primary-btn" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add Account'}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="ws-primary-btn" onClick={() => setShowAdd(true)}>
              + Add Trading Account
            </button>
          )}
        </div>
      </div>

      {manageAccessFor && <ManageAccessPanel account={manageAccessFor} onClose={() => setManageAccessFor(null)} />}
      {linkDataFor && <LinkLocalAccountPanel account={linkDataFor} onClose={() => setLinkDataFor(null)} />}
    </>
  )
}
