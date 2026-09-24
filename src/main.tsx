import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './workspace/workspace.css'
import './marketing/marketing.css'
import App from './App.tsx'
import { AuthGate } from './workspace/AuthGate.tsx'
import { WorkspaceAuthProvider } from './workspace/WorkspaceAuthContext.tsx'
import { WorkspaceBar } from './workspace/WorkspaceBar.tsx'
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

function TradingJournalApp() {
  return (
    <WorkspaceAuthProvider>
      <AuthGate>
        <WorkspaceBar />
        <App />
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
