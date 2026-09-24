import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Trade } from '../../types'
import { useMarketData } from '../../hooks/useMarketData'
import { useTradingChart } from '../../hooks/useTradingChart'
import { useChartDrawings } from '../../hooks/useChartDrawings'
import { marketDataService } from '../../services/marketData/MarketDataService'
import { ChartHeader } from './ChartHeader'
import { TimeframeSelector } from './TimeframeSelector'
import { ChartTypeToggle } from './ChartTypeToggle'
import { IndicatorsMenu } from './IndicatorsMenu'
import { MeasureMenu } from './MeasureMenu'
import { OHLCReadout } from './OHLCReadout'
import { DateRangeMeasurement } from './DateRangeMeasurement'
import { buildTradeMarkers, toSeriesMarkers } from './TradeMarkers'
import { DrawingsPrimitive } from './DrawingsPrimitive'
import { DEFAULT_INDICATOR_SETTINGS, type ChartTradeMarker, type ChartType, type IndicatorSettings, type MarketInstrument, type Timeframe } from './chartTypes'
import { getPnlLabel } from '../../utils/tradeMath'

export interface TradingChartProps {
  instrument: MarketInstrument
  timeframe?: Timeframe
  accountId: string
  tradeId?: string
  /** Trades already scoped to `accountId + instrument` by the caller — TradingChart does no DB querying or filtering of its own. */
  trades: Trade[]
  isMaximized: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

const INDICATOR_PREFS_KEY = 'trading-chart-indicator-prefs'

function loadIndicatorPrefs(): IndicatorSettings {
  try {
    const raw = localStorage.getItem(INDICATOR_PREFS_KEY)
    if (!raw) {
      return DEFAULT_INDICATOR_SETTINGS
    }
    return { ...DEFAULT_INDICATOR_SETTINGS, ...(JSON.parse(raw) as Partial<IndicatorSettings>) }
  } catch {
    return DEFAULT_INDICATOR_SETTINGS
  }
}

export function TradingChart({ instrument, timeframe: initialTimeframe, trades, isMaximized, onToggleMaximize, onClose }: TradingChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe ?? '1D')
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [indicators, setIndicators] = useState<IndicatorSettings>(loadIndicatorPrefs)
  const [selectedMarker, setSelectedMarker] = useState<ChartTradeMarker | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<ChartTradeMarker[]>([])
  const drawingsPrimitiveRef = useRef<DrawingsPrimitive>(new DrawingsPrimitive())

  useEffect(() => {
    try {
      localStorage.setItem(INDICATOR_PREFS_KEY, JSON.stringify(indicators))
    } catch {
      // best-effort only — never block the chart on storage failures
    }
  }, [indicators])

  const { status, bars, errorMessage } = useMarketData(instrument, timeframe)

  const handleMarkerClick = (markerId: string): void => {
    const match = markersRef.current.find((marker) => `${marker.tradeId}-${marker.kind}` === markerId)
    setSelectedMarker(match ?? null)
  }

  const { crosshair, setData, setMarkers, updateBar, fitContent, bollingerLatest, rsiLatest, chartRef, seriesRef } = useTradingChart(containerRef, {
    onMarkerClick: handleMarkerClick,
    chartType,
    indicators,
    drawingsPrimitive: drawingsPrimitiveRef.current,
  })

  const { activeTool, selectedId, rangeMeasurement, startTool, cancelTool, deleteSelected, clearDrawings, clearMeasurement } =
    useChartDrawings(containerRef, chartRef, seriesRef, drawingsPrimitiveRef.current)

  useEffect(() => {
    if (bars.length === 0) {
      return
    }
    setData(bars)
    const chartMarkers = buildTradeMarkers(trades, bars)
    markersRef.current = chartMarkers
    setMarkers(toSeriesMarkers(chartMarkers))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, trades])

  useEffect(() => {
    const provider = marketDataService.getActiveProvider()
    if (!provider || status !== 'ready') {
      return
    }

    const unsubscribe = provider.subscribeToRealtime(instrument, timeframe, (bar) => {
      updateBar(bar)
    })

    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument, timeframe, status])

  useEffect(() => {
    setSelectedMarker(null)
    cancelTool()
    clearMeasurement()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument, timeframe])

  const toolHint = useMemo(() => {
    if (!activeTool) {
      return null
    }
    if (activeTool === 'horizontal') return 'Press and drag to position the horizontal line, release to place it. Esc to cancel.'
    if (activeTool === 'vertical') return 'Press and drag to position the vertical line, release to place it. Esc to cancel.'
    if (activeTool === 'range') return 'Press on the start candle and drag to the end candle, then release. Esc to cancel.'
    if (activeTool === 'fib') return 'Press and drag from the start point to the end point, then release. Esc to cancel.'
    return 'Press and hold the start point, drag to the end point, then release. Esc to cancel.'
  }, [activeTool])

  return (
    <div className={isMaximized ? 'chart-panel chart-panel-maximized' : 'chart-panel'}>
      <ChartHeader instrument={instrument} isMaximized={isMaximized} onToggleMaximize={onToggleMaximize} onClose={onClose} />

      <div className="chart-panel-body">
        <div className="chart-toolbar">
          <ChartTypeToggle value={chartType} onChange={setChartType} />
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />
          <div className="chart-toolbar-right">
            <IndicatorsMenu value={indicators} onChange={setIndicators} />
            <MeasureMenu activeTool={activeTool} onSelectTool={startTool} onClearDrawings={clearDrawings} />
            <button type="button" className="chart-toolbar-btn" aria-label="Reset zoom" onClick={fitContent}>
              <RotateCcw size={15} />
            </button>
            {selectedId && (
              <button type="button" className="chart-toolbar-btn danger" onClick={deleteSelected}>
                Delete
              </button>
            )}
          </div>
        </div>

        {toolHint && (
          <div className="chart-tool-hint">
            <span>{toolHint}</span>
            <button type="button" className="text-link" onClick={cancelTool}>Cancel</button>
          </div>
        )}

        <div className="chart-canvas-wrap">
          <div className="chart-legend-overlay">
            {indicators.bollinger && bollingerLatest && (
              <span className="chart-indicator-legend">
                BB ({indicators.bollingerPeriod}, {indicators.bollingerMultiplier}){' '}
                <span style={{ color: '#7C3AED' }}>{bollingerLatest.upper.toFixed(2)}</span>{' '}
                <span style={{ color: '#F59E0B' }}>{bollingerLatest.middle.toFixed(2)}</span>{' '}
                <span style={{ color: '#7C3AED' }}>{bollingerLatest.lower.toFixed(2)}</span>
              </span>
            )}
            {indicators.rsi && rsiLatest !== null && (
              <span className="chart-indicator-legend">RSI ({indicators.rsiPeriod}) <strong>{rsiLatest.toFixed(2)}</strong></span>
            )}
            <OHLCReadout readout={crosshair} />
          </div>
          <div ref={containerRef} className="chart-canvas-el" />

          {status !== 'ready' && (
            <div className="chart-status-overlay">
              {status === 'not-configured' && (
                <>
                  <div className="empty-state-icon" style={{ margin: '0 auto 10px' }}>📡</div>
                  <p><strong>Market data connection not configured</strong></p>
                  <p className="chart-status-sub">Connect a market-data provider to see live charts here.</p>
                </>
              )}
              {status === 'loading' && <p>Loading market data…</p>}
              {status === 'empty' && <p>No market data available for this instrument/timeframe.</p>}
              {status === 'error' && (
                <>
                  <p><strong>{errorMessage ?? 'Unable to load market data.'}</strong></p>
                  {!errorMessage && <p className="chart-status-sub">Try again.</p>}
                </>
              )}
            </div>
          )}
        </div>

        {rangeMeasurement && <DateRangeMeasurement measurement={rangeMeasurement} onClose={clearMeasurement} />}

        {selectedMarker && (
          <div className="chart-marker-detail">
            <div className="chart-marker-detail-head">
              <strong>Trade #{selectedMarker.tradeId.slice(0, 8)}</strong>
              <button type="button" className="text-link" onClick={() => setSelectedMarker(null)}>Close</button>
            </div>
            <div className="detail-grid">
              <div><strong>Side</strong><span>{selectedMarker.side}</span></div>
              <div><strong>Quantity</strong><span>{selectedMarker.quantity}</span></div>
              <div><strong>Entry Price</strong><span>₹{selectedMarker.entryPrice}</span></div>
              <div><strong>Exit Price</strong><span>{selectedMarker.exitPrice > 0 ? `₹${selectedMarker.exitPrice}` : '-'}</span></div>
              <div><strong>Entry Date</strong><span>{selectedMarker.tradeDate}</span></div>
              <div><strong>Exit Date</strong><span>{selectedMarker.exitDate || '-'}</span></div>
              <div><strong>Status</strong><span>{selectedMarker.status}</span></div>
              <div><strong>P/L</strong><span className={selectedMarker.netPnl >= 0 ? 'profit' : 'loss'}>{getPnlLabel(selectedMarker.netPnl)}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
