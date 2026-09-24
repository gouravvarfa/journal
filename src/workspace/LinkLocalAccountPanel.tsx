import { useEffect, useState } from 'react'
import { db } from '../database/db'
import type { Account } from '../types'
import type { TradingAccountApi } from './api'
import { linkAccountForSharing, unlinkAccountFromSharing } from './tradeSync'

/**
 * OWNER-only action: link a local (Dexie) trading account to this backend
 * account so its real trades — not an empty container — show up for
 * anyone this account is shared with. Uploads existing trades once
 * (idempotent server-side) and remembers the link for future syncing.
 */
export function LinkLocalAccountPanel({ account, onClose }: { account: TradingAccountApi; onClose: () => void }) {
  const [localAccounts, setLocalAccounts] = useState<Account[]>([])
  const [selectedLocalId, setSelectedLocalId] = useState('')
  const [linkedLocalId, setLinkedLocalId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void db.accounts.toArray().then(setLocalAccounts)
    void db.accountLinks
      .filter((link) => link.backendAccountId === account.id)
      .first()
      .then((link) => {
        if (link) {
          setLinkedLocalId(link.localAccountId)
          setSelectedLocalId(link.localAccountId)
        }
      })
  }, [account.id])

  async function handleLink(): Promise<void> {
    if (!selectedLocalId) {
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await linkAccountForSharing(selectedLocalId, account.id)
      setLinkedLocalId(selectedLocalId)
      setMessage(`Linked. ${result.imported} trade${result.imported === 1 ? '' : 's'} uploaded${result.skippedExisting ? `, ${result.skippedExisting} already up to date` : ''}.`)
    } catch {
      setMessage('Could not link this account — is the backend running?')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlink(): Promise<void> {
    if (!linkedLocalId) {
      return
    }
    setBusy(true)
    try {
      await unlinkAccountFromSharing(linkedLocalId)
      setLinkedLocalId(null)
      setMessage('Unlinked. New local trades will no longer sync to this shared account; already-uploaded trades stay put.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ws-modal-backdrop" onClick={onClose}>
      <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ws-modal-header">
          <div>
            <h2>Link Local Data</h2>
            <p className="ws-muted">{account.name}</p>
          </div>
          <button type="button" className="ws-close-btn" onClick={onClose}>×</button>
        </div>

        <p className="ws-muted small">
          This account is empty on the server until you link it to one of your existing local trading accounts.
          Once linked, that account&apos;s trades upload here, and anyone this account is shared with will see real data.
        </p>

        {localAccounts.length === 0 ? (
          <div className="ws-empty-state">
            <p>No local trading accounts found in this browser to link.</p>
          </div>
        ) : (
          <label className="ws-field">
            Local account
            <select value={selectedLocalId} onChange={(e) => setSelectedLocalId(e.target.value)} disabled={busy}>
              <option value="">Select an account…</option>
              {localAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName}
                  {a.alias ? ` (${a.alias})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {message && <p className="ws-muted small">{message}</p>}

        <div className="ws-modal-actions">
          {linkedLocalId && (
            <button type="button" className="ws-link-btn ws-danger-link" disabled={busy} onClick={() => void handleUnlink()}>
              Unlink
            </button>
          )}
          <button type="button" className="ws-primary-btn" disabled={busy || !selectedLocalId} onClick={() => void handleLink()}>
            {busy ? 'Working…' : linkedLocalId ? 'Re-sync now' : 'Link & Upload Trades'}
          </button>
        </div>
      </div>
    </div>
  )
}
