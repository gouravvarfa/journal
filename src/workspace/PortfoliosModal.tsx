import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, workspaceApi, type PortfolioApi } from './api'
import { useWorkspaceAuth } from './WorkspaceAuthContext'
import { ManagePortfolioAccessPanel } from './ManagePortfolioAccessPanel'

/**
 * A portfolio manager's client-grouping layer (Phase 10.2) — sits above
 * "My Accounts": a Portfolio bundles several TradingAccounts so one
 * invitation (via ManagePortfolioAccessPanel) grants read access to all of
 * them at once. A solo trader never needs this; it only appears alongside
 * "My Accounts" in the workspace bar.
 */
export function PortfoliosModal({ onClose }: { onClose: () => void }) {
  const { currentWorkspace } = useWorkspaceAuth()
  const [portfolios, setPortfolios] = useState<PortfolioApi[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [clientDisplayName, setClientDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [accessFor, setAccessFor] = useState<PortfolioApi | null>(null)

  async function load(): Promise<void> {
    if (!currentWorkspace) return
    setError(null)
    try {
      setPortfolios(await workspaceApi.listPortfolios(currentWorkspace.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load portfolios.')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id])

  async function handleAdd(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!currentWorkspace) return
    setError(null)
    setSubmitting(true)
    try {
      await workspaceApi.createPortfolio(currentWorkspace.id, name, clientDisplayName)
      setName('')
      setClientDisplayName('')
      setShowAdd(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the portfolio.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(portfolio: PortfolioApi): Promise<void> {
    if (!window.confirm(`Delete "${portfolio.name}"? Its trading accounts are kept, just un-grouped.`)) {
      return
    }
    setBusyId(portfolio.id)
    try {
      await workspaceApi.deletePortfolio(portfolio.id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the portfolio.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="ws-modal-backdrop" onClick={onClose}>
        <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="ws-modal-header">
            <div>
              <h2>Portfolios</h2>
              {currentWorkspace && <p className="ws-muted">{currentWorkspace.name} · group accounts by client</p>}
            </div>
            <button type="button" className="ws-close-btn" onClick={onClose}>×</button>
          </div>

          {error && <p className="ws-error">{error}</p>}
          {portfolios === null && <p className="ws-muted">Loading…</p>}

          {portfolios?.length === 0 && !showAdd && (
            <div className="ws-empty-state">
              <p>No portfolios yet. Create one to group a client&apos;s trading accounts behind a single invite.</p>
            </div>
          )}

          {portfolios && portfolios.length > 0 && (
            <div className="ws-account-grid">
              {portfolios.map((portfolio) => (
                <div key={portfolio.id} className="ws-account-card">
                  <div className="ws-account-card-top">
                    <strong>{portfolio.name}</strong>
                    <span className="ws-role-pill">{portfolio.role}</span>
                  </div>
                  <p className="ws-muted">{portfolio.client_display_name || 'No client name set'}</p>
                  <p className="ws-muted small">
                    {portfolio.account_count} account{portfolio.account_count === 1 ? '' : 's'}
                  </p>
                  <div className="ws-account-card-actions">
                    {portfolio.role === 'OWNER' && (
                      <button type="button" className="ws-link-btn" onClick={() => setAccessFor(portfolio)}>
                        Manage Access
                      </button>
                    )}
                    {portfolio.role === 'OWNER' && (
                      <button
                        type="button"
                        className="ws-link-btn ws-danger-link"
                        disabled={busyId === portfolio.id}
                        onClick={() => void handleDelete(portfolio)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAdd ? (
            <form className="ws-add-account-form" onSubmit={(e) => void handleAdd(e)}>
              <label className="ws-field">
                Portfolio name
                <input value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={200} placeholder="e.g. Divyanshi's Portfolio" />
              </label>
              <label className="ws-field">
                Client name (optional)
                <input value={clientDisplayName} onChange={(e) => setClientDisplayName(e.target.value)} maxLength={200} />
              </label>
              <div className="ws-modal-actions">
                <button type="button" className="ws-secondary-btn" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="ws-primary-btn" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Portfolio'}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="ws-primary-btn" onClick={() => setShowAdd(true)}>
              + New Portfolio
            </button>
          )}
        </div>
      </div>

      {accessFor && <ManagePortfolioAccessPanel portfolio={accessFor} onClose={() => setAccessFor(null)} />}
    </>
  )
}
