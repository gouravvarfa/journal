import { Briefcase, Eye, UserRound } from 'lucide-react'
import type { ComponentType } from 'react'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

export type AppMode = 'personal' | 'view' | 'business'

const cards: Array<{ mode: AppMode; title: string; description: string; icon: ComponentType<{ size?: number }> }> = [
  { mode: 'personal', title: 'Personal Trading', description: 'Manage and trade with your personal accounts.', icon: UserRound },
  { mode: 'view', title: 'View Section', description: 'View accounts that have been shared with you.', icon: Eye },
  { mode: 'business', title: 'Business', description: 'Manage business accounts, portfolios and shared accounts.', icon: Briefcase },
]

/** Landing page shown after login: the user picks which section to enter. */
export function ModeHome({ onSelect }: { onSelect: (mode: AppMode) => void }) {
  const { me } = useWorkspaceAuth()

  return (
    <div className="ws-mode-home">
      <h1>Welcome{me ? `, ${me.user.display_name}` : ''}</h1>
      <p className="ws-muted">Choose where you want to work.</p>
      <div className="ws-mode-grid">
        {cards.map(({ mode, title, description, icon: Icon }) => (
          <button key={mode} type="button" className="ws-mode-card" onClick={() => onSelect(mode)}>
            <span className="ws-mode-card-icon">
              <Icon size={26} />
            </span>
            <strong>{title}</strong>
            <span className="ws-muted">{description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
