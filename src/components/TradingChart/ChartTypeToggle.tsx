import { CandlestickChart, LineChart } from 'lucide-react'
import type { ChartType } from './chartTypes'

interface ChartTypeToggleProps {
  value: ChartType
  onChange: (chartType: ChartType) => void
}

export function ChartTypeToggle({ value, onChange }: ChartTypeToggleProps) {
  return (
    <div className="chart-type-toggle" role="tablist" aria-label="Chart type">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'candlestick'}
        className={value === 'candlestick' ? 'chart-toolbar-btn active' : 'chart-toolbar-btn'}
        onClick={() => onChange('candlestick')}
      >
        <CandlestickChart size={15} />
        Candlestick
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'line'}
        className={value === 'line' ? 'chart-toolbar-btn active' : 'chart-toolbar-btn'}
        onClick={() => onChange('line')}
      >
        <LineChart size={15} />
        Line
      </button>
    </div>
  )
}
