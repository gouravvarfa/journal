import { ArrowRight, Briefcase, Eye, UserRound } from 'lucide-react'
import type { ComponentType } from 'react'
import { useWorkspaceAuth } from './WorkspaceAuthContext'

export type AppMode = 'personal' | 'view' | 'business'

const cards: Array<{
  mode: AppMode
  title: string
  description: string
  icon: ComponentType<{ size?: number }>
  accent: 'personal' | 'view' | 'business'
}> = [
  {
    mode: 'personal',
    title: 'Personal Trading',
    description: 'Manage and trade with your personal accounts.',
    icon: UserRound,
    accent: 'personal',
  },
  {
    mode: 'view',
    title: 'View Section',
    description: 'View accounts that have been shared with you.',
    icon: Eye,
    accent: 'view',
  },
  {
    mode: 'business',
    title: 'Business',
    description: 'Manage business accounts, portfolios and shared accounts.',
    icon: Briefcase,
    accent: 'business',
  },
]

/** Landing page shown after login: the user picks which section to enter. */
export function ModeHome({ onSelect }: { onSelect: (mode: AppMode) => void }) {
  const { me } = useWorkspaceAuth()

  return (
    <div className="ws-mode-home">
      <div className="ws-mode-home-heading">
        <h1>Welcome{me ? `, ${me.user.display_name}` : ''}</h1>
        <p className="ws-mode-home-subtitle">Choose a workspace to get started.</p>
      </div>
      <div className="ws-mode-grid">
        {cards.map(({ mode, title, description, icon: Icon, accent }) => (
          <button
            key={mode}
            type="button"
            className={`ws-mode-card ws-mode-card-${accent}`}
            onClick={() => onSelect(mode)}
          >
            <span className="ws-mode-card-icon">
              <Icon size={24} />
            </span>
            <span className="ws-mode-card-body">
              <strong>{title}</strong>
              <span className="ws-mode-card-desc">{description}</span>
            </span>
            <span className="ws-mode-card-arrow">
              <ArrowRight size={18} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
