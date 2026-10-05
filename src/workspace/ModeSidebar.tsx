import { useState } from 'react'
import { Bell, Receipt } from 'lucide-react'
import { BillingPage } from './BillingPage'
import { InvitationsInbox } from './InvitationsInbox'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

/** Left navigation on the mode-select page: Invitations and Billing. */
export function ModeSidebar() {
  const { myInvitations, myPortfolioInvitations } = useWorkspaceAuth()
  const [panel, setPanel] = useState<'invitations' | 'billing' | null>(null)
  const pendingCount = myInvitations.length + myPortfolioInvitations.length

  return (
    <aside className="ws-sidebar">
      <div className="ws-sidebar-brand">Trading Journal</div>
      <nav className="ws-sidebar-nav">
        <button type="button" className={panel === 'invitations' ? 'ws-sidebar-item active' : 'ws-sidebar-item'} onClick={() => setPanel('invitations')}>
          <Bell size={17} />
          <span>Invitations</span>
          {pendingCount > 0 && <span className="ws-badge-count">{pendingCount}</span>}
        </button>
        <button type="button" className={panel === 'billing' ? 'ws-sidebar-item active' : 'ws-sidebar-item'} onClick={() => setPanel('billing')}>
          <Receipt size={17} />
          <span>Billing</span>
        </button>
      </nav>
      {panel === 'invitations' && <InvitationsInbox onClose={() => setPanel(null)} />}
      {panel === 'billing' && <BillingPage onClose={() => setPanel(null)} />}
    </aside>
  )
}
