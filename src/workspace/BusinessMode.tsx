import { useState } from 'react'
import { LayoutGrid, ShieldCheck, UsersRound } from 'lucide-react'
import App from '../App'
import type { TradingAccountApi } from './api'
import { MyAccountsModal } from './MyAccountsModal'
import { PortfoliosModal } from './PortfoliosModal'
import { UserPermissionsPage } from './UserPermissionsPage'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

const BUSINESS_ACCOUNT_TYPE = 'Business'

function isBusinessAccount(account: TradingAccountApi): boolean {
  return account.account_type.trim().toLowerCase() === BUSINESS_ACCOUNT_TYPE.toLowerCase() && !account.is_archived
}

/**
 * Business dashboard: the same journal UI as Personal Trading (App), pointed
 * at one backend business account at a time. Which accounts appear — and
 * whether this user can write — is decided by the backend (owner/admin vs
 * accepted VIEWER); pending or declined invitations never produce an account.
 *
 * Account creation deliberately reuses the existing Accounts panel
 * (MyAccountsModal) instead of a second, parallel "create business account"
 * form — opened only when the user asks for it (the "+ Create Business
 * Account" button below), never automatically on landing here.
 */
export function BusinessMode() {
  const { accounts, accountsLoading } = useWorkspaceAuth()
  const [panel, setPanel] = useState<'accounts' | 'portfolios' | null>(null)
  const [page, setPage] = useState<'dashboard' | 'users'>('dashboard')

  const businessAccounts = accounts.filter(isBusinessAccount)
  // Account switching UI was removed earlier; the first (only) business account is used.
  const selected = businessAccounts[0] ?? null

  let main: React.ReactNode
  if (accountsLoading && !selected) {
    main = (
      <div className="ws-mode-placeholder">
        <p className="ws-muted">Loading…</p>
      </div>
    )
  } else if (!selected) {
    main = (
      <div className="ws-mode-placeholder">
        <h2>Business Dashboard</h2>
        <p className="ws-muted">No business account available.</p>
        <button type="button" className="ws-primary-btn" onClick={() => setPanel('accounts')}>
          + Create Business Account
        </button>
      </div>
    )
  } else {
    main = (
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
    )
  }

  return (
    <>
      {main}
      {panel === 'accounts' && (
        <MyAccountsModal
          onClose={() => setPanel(null)}
          initialType={!selected ? BUSINESS_ACCOUNT_TYPE : undefined}
          autoOpenAdd={!selected}
        />
      )}
      {panel === 'portfolios' && <PortfoliosModal onClose={() => setPanel(null)} />}
    </>
  )
}
