import { useState } from 'react'
import { Ruler } from 'lucide-react'
import type { MeasureTool } from '../../hooks/useChartDrawings'

interface MeasureMenuProps {
  activeTool: MeasureTool | null
  onSelectTool: (tool: MeasureTool) => void
  onClearDrawings: () => void
}

const TOOLS: Array<{ key: MeasureTool; label: string }> = [
  { key: 'horizontal', label: 'Horizontal Line' },
  { key: 'vertical', label: 'Vertical Line' },
  { key: 'trend', label: 'Trend Line' },
  { key: 'fib', label: 'Fibonacci Retracement' },
  { key: 'range', label: 'Date Range' },
]

export function MeasureMenu({ activeTool, onSelectTool, onClearDrawings }: MeasureMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="chart-dropdown">
      <button type="button" className={`chart-toolbar-btn ${activeTool ? 'active' : ''}`} onClick={() => setOpen((current) => !current)}>
        <Ruler size={15} />
        Measure
      </button>
      {open && (
        <>
          <div className="chart-dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="chart-dropdown-panel">
            {TOOLS.map((tool) => (
              <button
                key={tool.key}
                type="button"
                className={`chart-dropdown-item chart-dropdown-btn ${activeTool === tool.key ? 'active' : ''}`}
                onClick={() => {
                  onSelectTool(tool.key)
                  setOpen(false)
                }}
              >
                {tool.label}
              </button>
            ))}
            <div className="chart-dropdown-divider" />
            <button
              type="button"
              className="chart-dropdown-item chart-dropdown-btn danger"
              onClick={() => {
                onClearDrawings()
                setOpen(false)
              }}
            >
              Clear Drawings
            </button>
          </div>
        </>
      )}
    </div>
  )
}
