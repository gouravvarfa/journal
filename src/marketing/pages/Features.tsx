const features = [
  {
    title: 'Trading Journal',
    points: ['Record every trade — entry, exit, strategy, reason', 'Attach screenshots for post-trade review', 'Full history, searchable and filterable'],
  },
  {
    title: 'Multi-Account Management',
    points: ['Unlimited trading accounts', 'Different brokers per account', 'Complete account-level data isolation', 'Fast account switcher'],
  },
  {
    title: 'Portfolio Management',
    points: ['Group accounts under one client portfolio', 'Portfolio-level P&L and performance', 'Historical performance over time'],
  },
  {
    title: 'Client Management',
    points: ['Create client portfolios', 'Assign trading accounts to a client', 'Invite, revoke, and audit every access change'],
  },
  {
    title: 'Read-Only Client Portal',
    points: ['Clients see their own portfolio only', 'Performance, P&L, trades and reports', 'Never broker secrets or your other accounts'],
  },
  {
    title: 'Analytics',
    points: ['Win rate and profit factor', 'Average win / average loss', 'Drawdown and return, computed from real trades'],
  },
  {
    title: 'Reports',
    points: ['Account and portfolio reports', 'Excel and PDF export', 'Every export respects the same access rules as the app'],
  },
  {
    title: 'Broker Integrations',
    points: ['Angel One supported today', 'More brokers planned', 'Credentials encrypted at rest, never shown to a Viewer'],
  },
  {
    title: 'AI / Advanced Analytics',
    points: ['Architecture in place for future trade-pattern and risk analysis', 'No fabricated AI results — this ships when it’s real'],
  },
]

export function Features() {
  return (
    <section className="mk-section">
      <p className="mk-eyebrow">Features</p>
      <h2>Everything a serious trading practice needs, nothing it doesn&apos;t</h2>
      <div className="mk-grid" style={{ marginTop: 24 }}>
        {features.map((f) => (
          <div key={f.title} className="mk-card">
            <h3>{f.title}</h3>
            <ul>
              {f.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
