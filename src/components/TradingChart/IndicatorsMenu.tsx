import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { IndicatorSettings } from './chartTypes'

interface IndicatorsMenuProps {
  value: IndicatorSettings
  onChange: (next: IndicatorSettings) => void
}

export function IndicatorsMenu({ value, onChange }: IndicatorsMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="chart-dropdown">
      <button type="button" className="chart-toolbar-btn" onClick={() => setOpen((current) => !current)}>
        <SlidersHorizontal size={15} />
        Indicators
      </button>
      {open && (
        <>
          <div className="chart-dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="chart-dropdown-panel">
            <label className="chart-dropdown-item">
              <input type="checkbox" checked={value.bollinger} onChange={(event) => onChange({ ...value, bollinger: event.target.checked })} />
              Bollinger Bands
            </label>
            <label className="chart-dropdown-item">
              <input type="checkbox" checked={value.rsi} onChange={(event) => onChange({ ...value, rsi: event.target.checked })} />
              RSI
            </label>
            <label className="chart-dropdown-item">
              <input type="checkbox" checked={value.volume} onChange={(event) => onChange({ ...value, volume: event.target.checked })} />
              Volume
            </label>
          </div>
        </>
      )}
    </div>
  )
}
