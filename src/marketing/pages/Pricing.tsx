import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { workspaceApi, type PlanPricingApi } from '../../workspace/api'

const rupees = (paise: number): string => (paise === 0 ? 'Free' : `₹${(paise / 100).toLocaleString('en-IN')}`)

const faqs = [
  { q: 'Can I manage multiple trading accounts?', a: 'Yes — there is no hard limit on trading accounts on any plan. Plan tiers affect entitlements like people-per-account, never account creation itself.' },
  { q: 'Can I manage client portfolios?', a: 'Yes — group any number of trading accounts under a Portfolio and manage them together.' },
  { q: 'Can I invite clients?', a: 'Yes — invite by email at the account or portfolio level with a Viewer or Admin role. It works even before they’ve signed up.' },
  { q: 'Can clients edit my trades?', a: 'No. A Client/Viewer role is always read-only, enforced by the server on every request — never just hidden in the UI.' },
  { q: 'Can clients see other accounts?', a: 'No. A client sees only the specific account or portfolio you shared with them — nothing else in your workspace.' },
  { q: 'What happens if I cancel?', a: 'Your plan reverts to Free at the end of the billing period. No trading accounts or data are ever deleted.' },
  { q: 'What happens when my subscription expires?', a: 'You keep read access to everything; new trading accounts beyond the Free entitlement pause until you resubscribe.' },
  { q: 'Can I export my data?', a: 'Yes — Excel and PDF export, always scoped to exactly what you have access to.' },
  { q: 'Which brokers are supported?', a: 'Angel One today, with more planned.' },
  { q: 'How are broker credentials protected?', a: 'Encrypted at rest on the server, never shown to a Viewer, and only ever decrypted for the account owner at the moment of use.' },
]

export function Pricing() {
  const [plans, setPlans] = useState<PlanPricingApi[] | null>(null)
  const [cycle, setCycle] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>('MONTHLY')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    workspaceApi
      .listPlanPricing()
      .then(setPlans)
      .catch(() => setError('Could not load live pricing — is the backend running?'))
  }, [])

  return (
    <section className="mk-section">
      <p className="mk-eyebrow">Pricing</p>
      <h2>Start free. Upgrade only when you need more.</h2>
      <p className="mk-lead">No hidden fees. No fake discounts. Cancel anytime — your data is never deleted.</p>

      {error && <p className="mk-lead" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="mk-cycle-toggle">
        {(['MONTHLY', 'QUARTERLY', 'YEARLY'] as const).map((c) => (
          <button key={c} type="button" className={c === cycle ? 'active' : ''} onClick={() => setCycle(c)}>
            {c.charAt(0) + c.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {plans && (
        <div className="mk-pricing-grid">
          {plans.map((plan) => {
            const price = cycle === 'MONTHLY' ? plan.price_monthly_paise : cycle === 'QUARTERLY' ? plan.price_quarterly_paise : plan.price_yearly_paise
            return (
              <div key={plan.name} className={`mk-pricing-card ${plan.name === 'PRO' ? 'featured' : ''}`}>
                <h3>{plan.name}</h3>
                <div className="mk-pricing-price">
                  {rupees(price)}
                  {price > 0 && <small> /{cycle.toLowerCase()}</small>}
                </div>
                <ul>
                  <li>{plan.max_trading_accounts !== null ? `${plan.max_trading_accounts} trading accounts` : 'Unlimited trading accounts'}</li>
                  <li>{plan.max_members_per_account !== null ? `${plan.max_members_per_account} people per account` : 'Unlimited people per account'}</li>
                  <li>Portfolios &amp; client sharing</li>
                  <li>Analytics &amp; reports</li>
                </ul>
                <Link to="/app" className="mk-btn-primary" style={{ marginTop: 8 }}>
                  {plan.name === 'FREE' ? 'Get Started' : `Upgrade to ${plan.name}`}
                </Link>
              </div>
            )
          })}
        </div>
      )}

      <div className="mk-section tight" style={{ padding: '48px 0 0' }}>
        <h2>Frequently asked questions</h2>
        <div style={{ marginTop: 16 }}>
          {faqs.map((f) => (
            <div key={f.q} className="mk-faq-item">
              <h4>{f.q}</h4>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
