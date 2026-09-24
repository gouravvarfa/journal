import { useState } from 'react'
import { LayoutGrid, Receipt, Share2, UsersRound } from 'lucide-react'
import { AccountSwitcher } from './AccountSwitcher'
import { MyAccountsModal } from './MyAccountsModal'
import { PortfoliosModal } from './PortfoliosModal'
import { BillingPage } from './BillingPage'
import { InvitationsInbox } from './InvitationsInbox'
import { SharedWithMeView } from './SharedWithMeView'
import { ProfileModal } from './ProfileModal'
import { UserMenu } from './UserMenu'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

/**
 * A thin persistent strip above the existing (untouched) Journal app,
 * surfacing the new backend-driven Workspace/TradingAccount model:
 * current workspace, the account switcher, and every SaaS-layer feature
 * (accounts, portfolios, billing, sharing). Deliberately does not touch
 * App.tsx or the Dexie-backed trade data.
 */
export function WorkspaceBar() {
  const { me, currentWorkspace, logout, myInvitations, myPortfolioInvitations } = useWorkspaceAuth()
  const [showAccounts, setShowAccounts] = useState(false)
  const [showPortfolios, setShowPortfolios] = useState(false)
  const [showBilling, setShowBilling] = useState(false)
  const [showInvitations, setShowInvitations] = useState(false)
  const [showSharedWithMe, setShowSharedWithMe] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  if (!me || !currentWorkspace) {
    return null
  }

  const pendingCount = myInvitations.length + myPortfolioInvitations.length

  return (
    <div className="ws-bar">
      <div className="ws-bar-left">
        <span className="ws-bar-workspace">{currentWorkspace.name}</span>
        <AccountSwitcher />
      </div>
      <nav className="ws-bar-nav">
        <button type="button" className="ws-nav-btn" onClick={() => setShowAccounts(true)}>
          <LayoutGrid size={15} />
          Accounts
        </button>
        <button type="button" className="ws-nav-btn" onClick={() => setShowPortfolios(true)}>
          <UsersRound size={15} />
          Portfolios
        </button>
        <button type="button" className="ws-nav-btn ws-nav-btn-badge" onClick={() => setShowSharedWithMe(true)}>
          <Share2 size={15} />
          Shared With Me
          {pendingCount > 0 && <span className="ws-badge-count">{pendingCount}</span>}
        </button>
        <button type="button" className="ws-nav-btn" onClick={() => setShowBilling(true)}>
          <Receipt size={15} />
          Billing
        </button>
      </nav>
      <div className="ws-bar-right">
        <UserMenu
          displayName={me.user.display_name}
          email={me.user.email}
          pendingCount={pendingCount}
          onProfile={() => setShowProfile(true)}
          onInvitations={() => setShowInvitations(true)}
          onLogout={() => void logout()}
        />
      </div>

      {showAccounts && <MyAccountsModal onClose={() => setShowAccounts(false)} />}
      {showPortfolios && <PortfoliosModal onClose={() => setShowPortfolios(false)} />}
      {showBilling && <BillingPage onClose={() => setShowBilling(false)} />}
      {showInvitations && <InvitationsInbox onClose={() => setShowInvitations(false)} />}
      {showSharedWithMe && <SharedWithMeView onClose={() => setShowSharedWithMe(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  )
}
