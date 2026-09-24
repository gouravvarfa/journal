import { Link, NavLink, Outlet } from 'react-router-dom'

const navLinks = [
  { to: '/features', label: 'Features' },
  { to: '/for-traders', label: 'For Traders' },
  { to: '/for-portfolio-managers', label: 'For Portfolio Managers' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/security', label: 'Security' },
]

export function MarketingLayout() {
  return (
    <div className="mk-page">
      <header className="mk-nav">
        <Link to="/" className="mk-nav-brand">
          <span className="mk-nav-mark">TJ</span>
          Trading Journal
        </Link>
        <nav className="mk-nav-links">
          {navLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mk-nav-cta">
          <Link to="/app" className="mk-btn-secondary">Login</Link>
          <Link to="/app" className="mk-btn-primary">Get Started</Link>
        </div>
      </header>

      <main className="mk-main">
        <Outlet />
      </main>

      <footer className="mk-footer">
        <p>
          © {new Date().getFullYear()} Trading Journal · <Link to="/about">About</Link> · <Link to="/contact">Contact</Link> ·{' '}
          <Link to="/security">Security</Link>
        </p>
      </footer>
    </div>
  )
}
