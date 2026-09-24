import type { CrosshairReadout } from '../../hooks/useTradingChart'

interface OHLCReadoutProps {
  readout: CrosshairReadout | null
}

const formatTime = (seconds: number): string =>
  new Date(seconds * 1000).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Compact OHLC values for the hovered candle — renders nothing until the user hovers the chart, since the symbol/timeframe are already shown in the header above. */
export function OHLCReadout({ readout }: OHLCReadoutProps) {
  if (!readout) {
    return null
  }

  const isUp = readout.close >= readout.open

  return (
    <div className="ohlc-readout">
      <span className="ohlc-readout-time">{formatTime(readout.time)}</span>
      <span>O <strong>{readout.open.toFixed(2)}</strong></span>
      <span>H <strong>{readout.high.toFixed(2)}</strong></span>
      <span>L <strong>{readout.low.toFixed(2)}</strong></span>
      <span>C <strong className={isUp ? 'profit' : 'loss'}>{readout.close.toFixed(2)}</strong></span>
    </div>
  )
}
