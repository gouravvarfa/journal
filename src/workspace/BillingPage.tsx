import { useEffect, useState } from 'react'
import { ApiError, workspaceApi, type BillingStatusApi, type PlanPricingApi } from './api'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void }
  }
}

let razorpayScriptPromise: Promise<void> | null = null

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve()
  }
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load Razorpay checkout script'))
      document.head.appendChild(script)
    })
  }
  return razorpayScriptPromise
}

const rupees = (paise: number): string => `₹${(paise / 100).toLocaleString('en-IN')}`

/**
 * Billing page (Phase 10.3) — TEST MODE Razorpay only. The backend never
 * trusts anything this page reports about payment success: /checkout
 * creates a real Razorpay test-mode order, and /verify recomputes the
 * signature server-side before ever touching the workspace's plan.
 */
export function BillingPage({ onClose }: { onClose: () => void }) {
  const { currentWorkspace, me } = useWorkspaceAuth()
  const [plans, setPlans] = useState<PlanPricingApi[] | null>(null)
  const [status, setStatus] = useState<BillingStatusApi | null>(null)
  const [cycle, setCycle] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>('MONTHLY')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)

  const isOwner = currentWorkspace?.role === 'OWNER'

  async function load(): Promise<void> {
    if (!currentWorkspace) return
    setError(null)
    try {
      const [planList, billingStatus] = await Promise.all([
        workspaceApi.listPlanPricing(),
        workspaceApi.getBillingStatus(currentWorkspace.id),
      ])
      setPlans(planList)
      setStatus(billingStatus)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load billing information.')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id])

  async function handleUpgrade(planName: string): Promise<void> {
    if (!currentWorkspace || !me) return
    setError(null)
    setMessage(null)
    setBusyPlan(planName)
    try {
      await loadRazorpayScript()
      const checkout = await workspaceApi.createCheckout(currentWorkspace.id, planName, cycle)

      if (!window.Razorpay) {
        throw new Error('Razorpay checkout is unavailable right now.')
      }

      const razorpay = new window.Razorpay({
        key: checkout.key_id,
        order_id: checkout.order_id,
        amount: checkout.amount_paise,
        currency: checkout.currency,
        name: 'Trading Journal',
        description: `${planName} — ${cycle.toLowerCase()}`,
        prefill: { email: me.user.email, name: me.user.display_name },
        theme: { color: '#2563eb' },
        handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          void (async () => {
            try {
              const updated = await workspaceApi.verifyPayment(
                currentWorkspace.id,
                response.razorpay_order_id,
                response.razorpay_payment_id,
                response.razorpay_signature,
              )
              setStatus(updated)
              setMessage(`Upgraded to ${updated.plan}.`)
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Payment verification failed.')
            } finally {
              setBusyPlan(null)
            }
          })()
        },
        modal: { ondismiss: () => setBusyPlan(null) },
      })
      razorpay.open()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not start checkout.')
      setBusyPlan(null)
    }
  }

  return (
    <div className="ws-modal-backdrop" onClick={onClose}>
      <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ws-modal-header">
          <div>
            <h2>Billing</h2>
            {currentWorkspace && <p className="ws-muted">{currentWorkspace.name}</p>}
          </div>
          <button type="button" className="ws-close-btn" onClick={onClose}>×</button>
        </div>

        {error && <p className="ws-error">{error}</p>}
        {message && <p className="ws-muted small">{message}</p>}

        {status && (
          <div className="ws-empty-state" style={{ textAlign: 'left' }}>
            <p><strong>Current plan:</strong> {status.plan}</p>
            {status.subscription_status && <p className="ws-muted small">Subscription: {status.subscription_status} ({status.billing_cycle})</p>}
            {status.current_period_end && (
              <p className="ws-muted small">Renews/expires: {new Date(status.current_period_end).toLocaleDateString()}</p>
            )}
            {(() => {
              const overLimit = status.max_trading_accounts !== null && status.trading_accounts_used > status.max_trading_accounts
              return (
                <p className="ws-muted small" style={overLimit ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                  Trading accounts used: {status.trading_accounts_used}
                  {status.max_trading_accounts !== null ? ` / ${status.max_trading_accounts}` : ' (unlimited)'}
                  {overLimit && ' — over your plan’s limit'}
                </p>
              )
            })()}
            <p className="ws-muted small" style={{ marginTop: 4 }}>
              This is informational only — creating a new trading account is never blocked by plan. Upgrading raises
              how many people you can invite per account.
            </p>
          </div>
        )}

        <div className="ws-invite-row" style={{ marginTop: 12 }}>
          {(['MONTHLY', 'QUARTERLY', 'YEARLY'] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={c === cycle ? 'ws-primary-btn' : 'ws-secondary-btn'}
              onClick={() => setCycle(c)}
            >
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {plans && (
          <div className="ws-account-grid" style={{ marginTop: 12 }}>
            {plans.map((plan) => {
              const price = cycle === 'MONTHLY' ? plan.price_monthly_paise : cycle === 'QUARTERLY' ? plan.price_quarterly_paise : plan.price_yearly_paise
              const isCurrent = status?.plan === plan.name
              return (
                <div key={plan.name} className={`ws-account-card ${isCurrent ? 'active' : ''}`}>
                  <div className="ws-account-card-top">
                    <strong>{plan.name}</strong>
                    {isCurrent && <span className="ws-role-pill">Current</span>}
                  </div>
                  <p className="ws-muted"><strong>{plan.price_monthly_paise === 0 ? 'Free' : rupees(price)}</strong>{plan.price_monthly_paise > 0 ? ` / ${cycle.toLowerCase()}` : ''}</p>
                  <p className="ws-muted small">
                    {plan.max_trading_accounts !== null ? `${plan.max_trading_accounts} trading accounts` : 'Unlimited trading accounts'}
                  </p>
                  <p className="ws-muted small">
                    {plan.max_members_per_account !== null ? `${plan.max_members_per_account} people per account` : 'Unlimited people per account'}
                  </p>
                  <div className="ws-account-card-actions">
                    {!isCurrent && plan.name !== 'FREE' && isOwner && (
                      <button
                        type="button"
                        className="ws-primary-btn"
                        disabled={busyPlan === plan.name}
                        onClick={() => void handleUpgrade(plan.name)}
                      >
                        {busyPlan === plan.name ? 'Opening…' : `Upgrade to ${plan.name}`}
                      </button>
                    )}
                    {!isOwner && !isCurrent && plan.name !== 'FREE' && (
                      <span className="ws-muted small">Only the workspace owner can upgrade</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="ws-muted small" style={{ marginTop: 12 }}>
          Test mode only — no real money is charged. Downgrading never deletes any trading accounts or data.
        </p>
      </div>
    </div>
  )
}
