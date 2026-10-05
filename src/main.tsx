import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './workspace/workspace.css'
import './marketing/marketing.css'
import { AuthGate } from './workspace/AuthGate.tsx'
import { WorkspaceAuthProvider } from './workspace/WorkspaceAuthContext.tsx'
import { ModeShell } from './workspace/ModeShell.tsx'
import { MarketingLayout } from './marketing/MarketingLayout.tsx'
import { Home } from './marketing/pages/Home.tsx'
import { Features } from './marketing/pages/Features.tsx'
import { ForTraders } from './marketing/pages/ForTraders.tsx'
import { ForPortfolioManagers } from './marketing/pages/ForPortfolioManagers.tsx'
import { Pricing } from './marketing/pages/Pricing.tsx'
import { Security } from './marketing/pages/Security.tsx'
import { About } from './marketing/pages/About.tsx'
import { Contact } from './marketing/pages/Contact.tsx'

registerSW({ immediate: true })

// crypto.randomUUID only exists in secure contexts (https / localhost); opened by LAN IP over http it is missing.
if (typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', {
    value: () =>
      '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      ),
  })
}

function TradingJournalApp() {
  return (
    <WorkspaceAuthProvider>
      <AuthGate>
        <ModeShell />
      </AuthGate>
    </WorkspaceAuthProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route index element={<Home />} />
          <Route path="features" element={<Features />} />
          <Route path="for-traders" element={<ForTraders />} />
          <Route path="for-portfolio-managers" element={<ForPortfolioManagers />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="security" element={<Security />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
        </Route>
        {/* The actual SaaS product — everything built in Phases 1-10 — now
            lives at /app instead of the root path, so the public marketing
            site can own "/". Every existing login/workspace/journal
            behavior is unchanged, just mounted under a new path. */}
        <Route path="/app/*" element={<TradingJournalApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
