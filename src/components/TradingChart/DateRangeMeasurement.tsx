import type { DateRangeMeasurement as DateRangeMeasurementData } from './drawingTypes'

interface DateRangeMeasurementProps {
  measurement: DateRangeMeasurementData
  onClose: () => void
}

const formatTime = (time: DateRangeMeasurementData['startTime']): string => {
  const seconds = typeof time === 'number' ? time : Math.floor(Date.parse(String(time)) / 1000)
  return new Date(seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DateRangeMeasurement({ measurement, onClose }: DateRangeMeasurementProps) {
  const priceDiff = measurement.endPrice - measurement.startPrice
  const percentChange = measurement.startPrice !== 0 ? (priceDiff / measurement.startPrice) * 100 : 0
  const isUp = priceDiff >= 0

  return (
    <div className="chart-range-measurement">
      <div className="chart-range-measurement-item">
        <label>Date Range</label>
        <strong>{formatTime(measurement.startTime)} → {formatTime(measurement.endTime)}</strong>
      </div>
      <div className="chart-range-measurement-item">
        <label>Days</label>
        <strong>{measurement.days}</strong>
      </div>
      <div className="chart-range-measurement-item">
        <label>Start Price</label>
        <strong>₹{measurement.startPrice.toFixed(2)}</strong>
      </div>
      <div className="chart-range-measurement-item">
        <label>End Price</label>
        <strong>₹{measurement.endPrice.toFixed(2)}</strong>
      </div>
      <div className="chart-range-measurement-item">
        <label>Change</label>
        <strong className={isUp ? 'profit' : 'loss'}>
          {isUp ? '+' : ''}₹{priceDiff.toFixed(2)} ({isUp ? '+' : ''}{percentChange.toFixed(2)}%)
        </strong>
      </div>
      <button type="button" className="text-link" onClick={onClose}>Close</button>
    </div>
  )
}
