import { Maximize2, Minimize2, X } from 'lucide-react'
import type { MarketInstrument } from './chartTypes'

interface ChartHeaderProps {
  instrument: MarketInstrument
  isMaximized: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

export function ChartHeader({ instrument, isMaximized, onToggleMaximize, onClose }: ChartHeaderProps) {
  return (
    <div className="chart-panel-header">
      <div className="chart-panel-title">
        <strong>{instrument.displayName}</strong>
        <span className={`badge ${instrument.market === 'NFO' ? 'badge-fut' : 'badge-cash'}`}>{instrument.market}</span>
      </div>
      <div className="chart-panel-actions">
        <button type="button" className="icon-btn" aria-label={isMaximized ? 'Restore' : 'Maximize'} onClick={onToggleMaximize}>
          {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button type="button" className="icon-btn" aria-label="Close chart" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
