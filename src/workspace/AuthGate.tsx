import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { ApiError, workspaceApi } from './api'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

type Screen = 'login' | 'signup' | 'forgot' | 'forgot-sent' | 'reset' | 'reset-done'

function getTokenFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('reset_token')
  } catch {
    return null
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useWorkspaceAuth()

  if (status === 'loading') {
    return (
      <div className="ws-auth-screen">
        <div className="ws-auth-loading">
          <Loader2 className="ws-spin" size={28} />
          <p className="ws-muted">Loading your workspace…</p>
        </div>
      </div>
    )
  }

  if (status === 'signed-out') {
    return <AuthScreens />
  }

  return <>{children}</>
}

const highlights = [
  { icon: TrendingUp, title: 'Unlimited trading accounts', subtitle: 'Seamlessly manage all your accounts' },
  { icon: Users, title: 'Share read-only access', subtitle: 'With clients or partners' },
  { icon: ShieldCheck, title: 'Server-enforced permissions', subtitle: 'Your data, always secure' },
]

function AuthScreens() {
  const [screen, setScreen] = useState<Screen>(() => (getTokenFromUrl() ? 'reset' : 'login'))
  const [resetToken, setResetToken] = useState<string>(() => getTokenFromUrl() ?? '')

  return (
    <div className="ws-auth-screen">
      <div className="ws-auth-shell">
        <div className="ws-auth-brand-panel">
          <div className="ws-auth-brand-chart" aria-hidden="true">
            <CandlestickGlyph />
          </div>

          <a href="/" className="ws-auth-brand-link">
            <span className="ws-auth-brand-mark">TJ</span>
            Trading Journal
          </a>
          <h1 className="ws-auth-brand-heading">
            One workspace for your <span className="ws-auth-heading-accent">trading, portfolios</span> and performance.
          </h1>
          <p className="ws-auth-brand-sub">
            Track your trades, analyze performance, and manage multiple accounts — all in one place.
          </p>
          <ul className="ws-auth-highlights">
            {highlights.map(({ icon: Icon, title, subtitle }) => (
              <li key={title}>
                <span className="ws-auth-highlight-icon">
                  <Icon size={16} />
                </span>
                <span className="ws-auth-highlight-copy">
                  <strong>{title}</strong>
                  <span>{subtitle}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ws-auth-form-panel">
          <a href="/" className="ws-auth-back-link">
            ← Back to home
          </a>

          {screen === 'login' && <LoginForm onForgot={() => setScreen('forgot')} onSignup={() => setScreen('signup')} />}
          {screen === 'signup' && <SignupForm onLogin={() => setScreen('login')} />}
          {screen === 'forgot' && (
            <ForgotPasswordForm
              onBack={() => setScreen('login')}
              onSent={(token) => {
                setResetToken(token ?? '')
                setScreen(token ? 'reset' : 'forgot-sent')
              }}
            />
          )}
          {screen === 'forgot-sent' && <ForgotSentNotice onBack={() => setScreen('login')} />}
          {screen === 'reset' && (
            <ResetPasswordForm token={resetToken} onDone={() => setScreen('reset-done')} onBack={() => setScreen('login')} />
          )}
          {screen === 'reset-done' && <ResetDoneNotice onLogin={() => setScreen('login')} />}
        </div>
      </div>
    </div>
  )
}

/** A near-invisible decorative candlestick strip for the brand panel — purely visual, no data. */
function CandlestickGlyph() {
  const bars = [
    { x: 0, h: 18, y: 30 },
    { x: 14, h: 30, y: 18 },
    { x: 28, h: 14, y: 34 },
    { x: 42, h: 40, y: 8 },
    { x: 56, h: 22, y: 26 },
    { x: 70, h: 34, y: 14 },
    { x: 84, h: 48, y: 0 },
  ]
  return (
    <svg viewBox="0 0 100 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={bar.y} width="7" height={bar.h} rx="1.5" fill="currentColor" />
      ))}
    </svg>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  minLength?: number
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="ws-field">
      {label}
      <div className="ws-input-icon-wrap ws-password-wrap">
        <Lock size={15} />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="ws-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  )
}

function LoginForm({ onForgot, onSignup }: { onForgot: () => void; onSignup: () => void }) {
  const { login } = useWorkspaceAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err) {
      // Password is never cleared on error, only re-typing the email is
      // avoided too — this is the single biggest login-conversion killer
      // per UX guidance, so both fields stay exactly as the user left them.
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="ws-auth-card" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <h2>Welcome back</h2>
        <p className="ws-muted">Log in to your workspace.</p>
      </div>

      {error && <p className="ws-error">{error}</p>}

      <label className="ws-field">
        Email
        <div className="ws-input-icon-wrap">
          <Mail size={15} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
          />
        </div>
      </label>

      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Enter your password" />

      <button type="button" className="ws-link-btn ws-forgot-link" onClick={onForgot}>
        Forgot password?
      </button>

      <button type="submit" className="ws-primary-btn ws-auth-submit" disabled={submitting}>
        {submitting ? 'Logging in…' : (
          <>
            Log in <ArrowRight size={16} />
          </>
        )}
      </button>

      <div className="ws-auth-divider">
        <span>OR</span>
      </div>

      <p className="ws-auth-switch">
        Don&apos;t have an account? <button type="button" className="ws-link-btn" onClick={onSignup}>Sign up</button>
      </p>
    </form>
  )
}

function SignupForm({ onLogin }: { onLogin: () => void }) {
  const { signup } = useWorkspaceAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const passwordTooShort = password.length > 0 && password.length < 8

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signup(email, password, displayName)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="ws-auth-card" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <h2>Create your workspace</h2>
        <p className="ws-muted">Free to start — no card required.</p>
      </div>

      {error && <p className="ws-error">{error}</p>}

      <label className="ws-field">
        Full name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={1} maxLength={120} autoComplete="name" autoFocus />
      </label>

      <label className="ws-field">
        Email
        <div className="ws-input-icon-wrap">
          <Mail size={15} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
      </label>

      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
      {passwordTooShort ? (
        <p className="ws-muted small ws-password-hint warn">At least 8 characters</p>
      ) : (
        <p className="ws-muted small ws-password-hint">At least 8 characters</p>
      )}

      <button type="submit" className="ws-primary-btn ws-auth-submit" disabled={submitting}>
        {submitting ? 'Creating your workspace…' : 'Create free account'}
      </button>

      <p className="ws-auth-switch">
        Already have an account? <button type="button" className="ws-link-btn" onClick={onLogin}>Log in</button>
      </p>
    </form>
  )
}

function ForgotPasswordForm({ onBack, onSent }: { onBack: () => void; onSent: (devToken: string | null) => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await workspaceApi.forgotPassword(email)
      onSent(result.dev_reset_token)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="ws-auth-card" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <h2>Reset your password</h2>
        <p className="ws-muted">Enter the email on your account and we&apos;ll send a reset link.</p>
      </div>

      {error && <p className="ws-error">{error}</p>}

      <label className="ws-field">
        Email
        <div className="ws-input-icon-wrap">
          <Mail size={15} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
        </div>
      </label>

      <button type="submit" className="ws-primary-btn ws-auth-submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>

      <button type="button" className="ws-link-btn ws-auth-switch-link" onClick={onBack}>
        ← Back to login
      </button>
    </form>
  )
}

function ForgotSentNotice({ onBack }: { onBack: () => void }) {
  return (
    <div className="ws-auth-card ws-auth-notice">
      <div className="ws-auth-notice-icon">
        <Mail size={26} />
      </div>
      <h2>Check your email</h2>
      <p className="ws-muted">
        If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 60 minutes.
      </p>
      <button type="button" className="ws-secondary-btn ws-auth-submit" onClick={onBack}>
        Back to login
      </button>
    </div>
  )
}

function ResetPasswordForm({ token: initialToken, onDone, onBack }: { token: string; onDone: () => void; onBack: () => void }) {
  const [token, setToken] = useState(initialToken)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setToken(initialToken)
  }, [initialToken])

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await workspaceApi.resetPassword(token, newPassword)
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'This reset link is invalid or has expired.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="ws-auth-card" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <h2>Choose a new password</h2>
        <p className="ws-muted">
          {initialToken
            ? 'Your reset link is ready below — set a new password to continue.'
            : 'No email is configured yet in this local environment, so paste your reset token below (returned by "Send reset link").'}
        </p>
      </div>

      {error && <p className="ws-error">{error}</p>}

      {!initialToken && (
        <label className="ws-field">
          Reset token
          <div className="ws-input-icon-wrap">
            <KeyRound size={15} />
            <input value={token} onChange={(e) => setToken(e.target.value)} required autoFocus />
          </div>
        </label>
      )}

      <PasswordField label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={8} />

      <button type="submit" className="ws-primary-btn ws-auth-submit" disabled={submitting || !token}>
        {submitting ? 'Resetting…' : 'Reset password'}
      </button>

      <button type="button" className="ws-link-btn ws-auth-switch-link" onClick={onBack}>
        ← Back to login
      </button>
    </form>
  )
}

function ResetDoneNotice({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="ws-auth-card ws-auth-notice">
      <div className="ws-auth-notice-icon success">
        <CheckCircle2 size={26} />
      </div>
      <h2>Password updated</h2>
      <p className="ws-muted">You&apos;ve been logged out everywhere for security. Log back in with your new password.</p>
      <button type="button" className="ws-primary-btn ws-auth-submit" onClick={onLogin}>
        Log in
      </button>
    </div>
  )
}
