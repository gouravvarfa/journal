const items = [
  { title: 'Account isolation', body: 'Every trading account, portfolio and workspace is isolated at the database and API level. Access is re-verified server-side on every request — never assumed from a frontend-supplied id.' },
  { title: 'Secure authentication', body: 'Passwords are hashed with bcrypt and never stored in plain text. Sessions are server-side and revocable — logging out or being removed from an account takes effect immediately, not after a token expires.' },
  { title: 'Read-only client access', body: 'A Client or Viewer role is enforced by the server on every write attempt, not just hidden in the interface.' },
  { title: 'Broker credential protection', body: 'Broker API keys, TOTP secrets and PINs are encrypted at rest and only ever decrypted for the account owner, at the moment they’re needed to connect.' },
  { title: 'Encryption', body: 'Sensitive fields are encrypted with a server-held key that never reaches the browser.' },
  { title: 'Audit logs', body: 'Logins, trade changes, invitations, permission changes, broker connections and billing events are all recorded with who, what and when.' },
  { title: 'Data ownership', body: 'You own your trading data. Downgrading a plan or canceling a subscription never deletes trading accounts or trade history.' },
  { title: 'Access revocation', body: 'Removing someone’s access to an account or portfolio takes effect on their very next request.' },
]

export function Security() {
  return (
    <section className="mk-section">
      <p className="mk-eyebrow">Security</p>
      <h2>How your data is protected</h2>
      <p className="mk-lead">
        We describe what the platform actually does below — no unsupported certifications or claims.
      </p>
      <div className="mk-grid">
        {items.map((item) => (
          <div key={item.title} className="mk-card">
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
