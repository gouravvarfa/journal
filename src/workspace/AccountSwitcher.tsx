import { useState } from 'react'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

export function AccountSwitcher() {
  const { accounts, currentAccountId, setCurrentAccountId } = useWorkspaceAuth()
  const [open, setOpen] = useState(false)

  const current = accounts.find((a) => a.id === currentAccountId) ?? null

  if (accounts.length === 0) {
    return null
  }

  return (
    <div className="ws-switcher">
      <button type="button" className="ws-switcher-btn" onClick={() => setOpen((v) => !v)}>
        <span className="ws-switcher-label">Current Account</span>
        <strong>{current ? current.name : 'Select account'}</strong>
      </button>
      {open && (
        <>
          <div className="ws-dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="ws-dropdown">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={`ws-dropdown-item ${account.id === currentAccountId ? 'active' : ''}`}
                onClick={() => {
                  setCurrentAccountId(account.id)
                  setOpen(false)
                }}
              >
                {account.id === currentAccountId ? '✓ ' : ''}
                {account.name}
                {account.is_archived && <span className="ws-badge-muted">Archived</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
