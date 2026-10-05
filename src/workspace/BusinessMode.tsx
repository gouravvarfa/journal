import { useState, type FormEvent } from 'react'
import { LayoutGrid, ShieldCheck, UsersRound } from 'lucide-react'
import App from '../App'
import { ApiError, workspaceApi, type TradingAccountApi } from './api'
import { MyAccountsModal } from './MyAccountsModal'
import { PortfoliosModal } from './PortfoliosModal'
import { UserPermissionsPage } from './UserPermissionsPage'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

const BUSINESS_ACCOUNT_TYPE = 'Business'

function isBusinessAccount(account: TradingAccountApi): boolean {
  return account.account_type.trim().toLowerCase() === BUSINESS_ACCOUNT_TYPE.toLowerCase() && !account.is_archived
}

function CreateBusinessAccountForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { currentWorkspace, refreshAccounts } = useWorkspaceAuth()
  const [name, setName] = useState('')
  const [broker, setBroker] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!currentWorkspace || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      // Created on the backend only (no local Dexie copy), so it never shows up under Personal Trading.
      const created = await workspaceApi.createAccount(currentWorkspace.id, name.trim(), broker.trim(), BUSINESS_ACCOUNT_TYPE)
      await refreshAccounts()
      onCreated(created.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the business account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="ws-business-form" onSubmit={(e) => void handleSubmit(e)}>
      <input placeholder="Business account name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="Broker (optional)" value={broker} maxLength={120} onChange={(e) => setBroker(e.target.value)} />
      <div className="ws-business-form-actions">
        <button type="submit" className="ws-primary-btn" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create Business Account'}
        </button>
      </div>
      {error && <p className="ws-error">{error}</p>}
    </form>
  )
}

/**
 * Business dashboard: the same journal UI as Personal Trading (App), pointed
 * at one backend business account at a time. Which accounts appear — and
 * whether this user can write — is decided by the backend (owner/admin vs
 * accepted VIEWER); pending or declined invitations never produce an account.
 */
export function BusinessMode() {
  const { accounts, accountsLoading } = useWorkspaceAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<'accounts' | 'portfolios' | null>(null)
  const [page, setPage] = useState<'dashboard' | 'users'>('dashboard')

  const businessAccounts = accounts.filter(isBusinessAccount)
  const selected = businessAccounts.find((a) => a.id === selectedId) ?? businessAccounts[0] ?? null

  if (accountsLoading && businessAccounts.length === 0) {
    return (
      <div className="ws-mode-placeholder">
        <p className="ws-muted">Loading…</p>
      </div>
    )
  }

  if (!selected) {
    return (
      <div className="ws-mode-placeholder">
        <h2>Business Dashboard</h2>
        <p className="ws-muted">No business account available. Create a business account to get started.</p>
        <CreateBusinessAccountForm onCreated={setSelectedId} />
      </div>
    )
  }

  return (
    <>
      <App
        key={selected.id}
        mode="business"
        businessAccount={selected}
        extraNav={[
          { key: 'accounts', label: 'Accounts', icon: LayoutGrid, onClick: () => setPanel('accounts') },
          { key: 'portfolios', label: 'Portfolios', icon: UsersRound, onClick: () => setPanel('portfolios') },
          { key: 'users', label: 'User and Permissions', icon: ShieldCheck, onClick: () => setPage('users'), active: page === 'users' },
        ]}
        extraPage={page === 'users' ? <UserPermissionsPage account={selected} /> : undefined}
        onTabSelect={() => setPage('dashboard')}
      />
      {panel === 'accounts' && <MyAccountsModal onClose={() => setPanel(null)} />}
      {panel === 'portfolios' && <PortfoliosModal onClose={() => setPanel(null)} />}
    </>
  )
}
