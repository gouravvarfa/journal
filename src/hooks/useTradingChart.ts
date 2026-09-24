import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from 'lightweight-charts'
import type { ChartType, IndicatorSettings, OHLCBar } from '../components/TradingChart/chartTypes'
import { calculateRSI } from '../services/indicators/rsi'
import { calculateBollingerBands } from '../services/indicators/bollingerBands'
import type { DrawingsPrimitive } from '../components/TradingChart/DrawingsPrimitive'

export interface CrosshairReadout {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface BollingerLatest {
  upper: number
  middle: number
  lower: number
}

interface UseTradingChartOptions {
  onMarkerClick?: (markerId: string) => void
  chartType: ChartType
  indicators: IndicatorSettings
  drawingsPrimitive: DrawingsPrimitive
}

const VOLUME_PANE_INDEX = 1
const RSI_PANE_INDEX = 2
// Proportions of the available drawer height — price stays the dominant
// pane (70-75%) with volume/RSI compact underneath, rather than fixed
// pixel heights that shrink the price pane on a taller drawer.
const VOLUME_PANE_RATIO = 0.11
const RSI_PANE_RATIO = 0.16
const MIN_VOLUME_HEIGHT = 56
const MIN_RSI_HEIGHT = 70

/**
 * Owns the lightweight-charts instance for its lifetime: creates it once,
 * wires up whichever price series (candlestick/line), volume pane, RSI
 * pane, Bollinger overlay and drawings primitive are currently requested,
 * resize handling and crosshair tracking, and tears everything down on
 * unmount. Knows nothing about journal trades or market-data providers —
 * purely chart mechanics. Indicator toggles add/remove series in place
 * rather than recreating the whole chart.
 *
 * Candlestick and line series are both created once at mount and never
 * removed while the chart is open — chart type toggling only flips
 * `visible` on each and moves the drawings primitive/markers/crosshair
 * handler across, rather than calling addSeries/removeSeries. That keeps
 * pane 0 from ever having zero series even momentarily, which otherwise
 * lets the chart's own pane bookkeeping collapse/reindex pane 0 and shift
 * every pane below it (volume/RSI) out from under their remembered index.
 */
export function useTradingChart(containerRef: React.RefObject<HTMLDivElement | null>, options: UseTradingChartOptions) {
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const activeSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bbMiddleRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiPriceLinesRef = useRef<IPriceLine[]>([])
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const lastMarkersRef = useRef<SeriesMarker<Time>[]>([])
  const barsRef = useRef<OHLCBar[]>([])
  const deactivateActiveRef = useRef<(() => void) | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [crosshair, setCrosshair] = useState<CrosshairReadout | null>(null)
  const [bollingerLatest, setBollingerLatest] = useState<BollingerLatest | null>(null)
  const [rsiLatest, setRsiLatest] = useState<number | null>(null)

  const onMarkerClickRef = useRef(options.onMarkerClick)
  onMarkerClickRef.current = options.onMarkerClick

  const syncPaneHeights = (): void => {
    const chart = chartRef.current
    const container = containerRef.current
    if (!chart || !container) {
      return
    }
    const total = container.clientHeight
    const volumeHeight = volumeSeriesRef.current ? Math.max(MIN_VOLUME_HEIGHT, Math.round(total * VOLUME_PANE_RATIO)) : 0
    const rsiHeight = rsiSeriesRef.current ? Math.max(MIN_RSI_HEIGHT, Math.round(total * RSI_PANE_RATIO)) : 0
    const priceHeight = Math.max(240, total - volumeHeight - rsiHeight)
    chart.panes()[0]?.setHeight(priceHeight)
    if (volumeSeriesRef.current) {
      chart.panes()[VOLUME_PANE_INDEX]?.setHeight(volumeHeight)
    }
    if (rsiSeriesRef.current) {
      chart.panes()[RSI_PANE_INDEX]?.setHeight(rsiHeight)
    }
  }

  const recalcIndicators = (): void => {
    const bars = barsRef.current
    const closes = bars.map((bar) => bar.close)

    if (bbUpperRef.current && bbMiddleRef.current && bbLowerRef.current) {
      const { upper, middle, lower } = calculateBollingerBands(
        closes,
        optionsRef.current.indicators.bollingerPeriod,
        optionsRef.current.indicators.bollingerMultiplier,
      )
      bbUpperRef.current.setData(toLineData(bars, upper))
      bbMiddleRef.current.setData(toLineData(bars, middle))
      bbLowerRef.current.setData(toLineData(bars, lower))
      const lastIndex = closes.length - 1
      if (lastIndex >= 0 && upper[lastIndex] !== null) {
        setBollingerLatest({ upper: upper[lastIndex] as number, middle: middle[lastIndex] as number, lower: lower[lastIndex] as number })
      } else {
        setBollingerLatest(null)
      }
    } else {
      setBollingerLatest(null)
    }

    if (rsiSeriesRef.current) {
      const rsi = calculateRSI(closes, optionsRef.current.indicators.rsiPeriod)
      rsiSeriesRef.current.setData(toLineData(bars, rsi))
      const lastIndex = rsi.length - 1
      setRsiLatest(lastIndex >= 0 ? rsi[lastIndex] : null)
    } else {
      setRsiLatest(null)
    }
  }

  const activateSeries = (chart: IChartApi, series: ISeriesApi<SeriesType>): (() => void) => {
    activeSeriesRef.current = series
    series.attachPrimitive(options.drawingsPrimitive)
    const markersPlugin = createSeriesMarkers(series, lastMarkersRef.current)
    markersPluginRef.current = markersPlugin

    const handleCrosshairMove: Parameters<typeof chart.subscribeCrosshairMove>[0] = (param) => {
      if (!param.time || !param.seriesData) {
        setCrosshair(null)
        return
      }
      const data = param.seriesData.get(series) as CandlestickData<Time> | LineData<Time> | undefined
      if (!data) {
        setCrosshair(null)
        return
      }
      if ('open' in data) {
        setCrosshair({ time: toSeconds(param.time), open: data.open, high: data.high, low: data.low, close: data.close })
      } else {
        setCrosshair({ time: toSeconds(param.time), open: data.value, high: data.value, low: data.value, close: data.value })
      }
    }
    chart.subscribeCrosshairMove(handleCrosshairMove)

    return () => {
      try {
        chart.unsubscribeCrosshairMove(handleCrosshairMove)
        series.detachPrimitive(options.drawingsPrimitive)
      } catch {
        // chart/series already disposed
      }
    }
  }

  // Chart creation — runs once for the component's lifetime. Both price
  // series are created here too (see class doc) so pane 0 never goes
  // empty for the life of the chart.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const chart = createChart(container, {
      layout: {
        background: { color: '#FFFFFF' },
        textColor: '#0F172A',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: '#EEF1F6' },
        horzLines: { color: '#EEF1F6' },
      },
      rightPriceScale: { borderColor: '#E6EAF1' },
      timeScale: { borderColor: '#E6EAF1', timeVisible: true },
      crosshair: { mode: 0 },
      autoSize: false,
      width: container.clientWidth,
      height: container.clientHeight,
    })

    chart.subscribeClick((param) => {
      if (param.hoveredInfo?.objectKind === 'series-marker' && typeof param.hoveredInfo.objectId === 'string') {
        onMarkerClickRef.current?.(param.hoveredInfo.objectId)
      }
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#16A34A',
      downColor: '#DC2626',
      borderUpColor: '#16A34A',
      borderDownColor: '#DC2626',
      wickUpColor: '#16A34A',
      wickDownColor: '#DC2626',
      visible: optionsRef.current.chartType === 'candlestick',
    })
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#2563EB',
      lineWidth: 2,
      visible: optionsRef.current.chartType === 'line',
    })
    candleSeriesRef.current = candleSeries
    lineSeriesRef.current = lineSeries

    const initialSeries = optionsRef.current.chartType === 'candlestick' ? candleSeries : lineSeries
    deactivateActiveRef.current = activateSeries(chart, initialSeries)

    let lastWidth = container.clientWidth
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        chart.resize(width, height)
        syncPaneHeights()
        // resize() keeps the current bar-width zoom level, not the visible
        // range — a small resize (e.g. a sidebar collapsing a few px)
        // should preserve the user's zoom/pan, but a large one (maximizing
        // or restoring the chart panel) leaves a huge empty margin instead
        // of stretching the candles to fill the new width, and that empty
        // area also breaks coordinateToTime() for any drawing gesture that
        // lands in it — so only large resizes trigger a refit.
        if (Math.abs(width - lastWidth) > 80) {
          chart.timeScale().fitContent()
        }
        lastWidth = width
      }
    })
    resizeObserver.observe(container)

    chartRef.current = chart

    return () => {
      resizeObserver.disconnect()
      try {
        deactivateActiveRef.current?.()
      } catch {
        // best-effort
      }
      chart.remove()
      chartRef.current = null
      deactivateActiveRef.current = null
      candleSeriesRef.current = null
      lineSeriesRef.current = null
      activeSeriesRef.current = null
      volumeSeriesRef.current = null
      bbUpperRef.current = null
      bbMiddleRef.current = null
      bbLowerRef.current = null
      rsiSeriesRef.current = null
      rsiPriceLinesRef.current = []
      markersPluginRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chart type toggle — flips `visible` on the two pre-created price series
  // and moves the drawings primitive/markers/crosshair handler across.
  // Never calls addSeries/removeSeries, so pane 0 is never briefly empty.
  useEffect(() => {
    const chart = chartRef.current
    const candleSeries = candleSeriesRef.current
    const lineSeries = lineSeriesRef.current
    if (!chart || !candleSeries || !lineSeries) {
      return
    }

    const nextSeries = options.chartType === 'candlestick' ? candleSeries : lineSeries
    if (activeSeriesRef.current === nextSeries) {
      return
    }

    deactivateActiveRef.current?.()
    candleSeries.applyOptions({ visible: options.chartType === 'candlestick' })
    lineSeries.applyOptions({ visible: options.chartType === 'line' })
    deactivateActiveRef.current = activateSeries(chart, nextSeries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.chartType])

  // Volume pane — toggled without touching the price series or the chart instance.
  // Cleanup-based (rather than ref-guarded) creation so React StrictMode's
  // dev-only mount→cleanup→mount cycle can't leave a series pointing at a
  // chart instance that's already been torn down and recreated.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !options.indicators.volume) {
      syncPaneHeights()
      return
    }
    const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, color: '#93A4BA' }, VOLUME_PANE_INDEX)
    volumeSeriesRef.current = volumeSeries
    if (barsRef.current.length > 0) {
      volumeSeries.setData(barsRef.current.map(toVolumePoint))
    }
    syncPaneHeights()
    return () => {
      try {
        chart.removeSeries(volumeSeries)
      } catch {
        // chart already disposed
      }
      volumeSeriesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.indicators.volume])

  // Bollinger Bands overlay — three line series on the price pane.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !options.indicators.bollinger) {
      setBollingerLatest(null)
      return
    }
    const upper = chart.addSeries(LineSeries, { color: '#7C3AED', lineWidth: 1, title: 'BB Upper' })
    const middle = chart.addSeries(LineSeries, { color: '#F59E0B', lineWidth: 1, title: 'BB Mid' })
    const lower = chart.addSeries(LineSeries, { color: '#7C3AED', lineWidth: 1, title: 'BB Lower' })
    bbUpperRef.current = upper
    bbMiddleRef.current = middle
    bbLowerRef.current = lower
    recalcIndicators()
    return () => {
      try {
        chart.removeSeries(upper)
        chart.removeSeries(middle)
        chart.removeSeries(lower)
      } catch {
        // chart already disposed
      }
      bbUpperRef.current = null
      bbMiddleRef.current = null
      bbLowerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.indicators.bollinger, options.indicators.bollingerPeriod, options.indicators.bollingerMultiplier])

  // RSI pane — with fixed 60/40 overbought/oversold reference price lines.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !options.indicators.rsi) {
      setRsiLatest(null)
      syncPaneHeights()
      return
    }
    const rsiSeries = chart.addSeries(LineSeries, { color: '#7C3AED', lineWidth: 2 }, RSI_PANE_INDEX)
    rsiSeriesRef.current = rsiSeries
    rsiPriceLinesRef.current = [
      rsiSeries.createPriceLine({ price: 60, color: '#EF4444', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: '60 Overbought' }),
      rsiSeries.createPriceLine({ price: 40, color: '#22C55E', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: '40 Oversold' }),
    ]
    recalcIndicators()
    syncPaneHeights()
    return () => {
      try {
        chart.removeSeries(rsiSeries)
      } catch {
        // chart already disposed
      }
      rsiSeriesRef.current = null
      rsiPriceLinesRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.indicators.rsi, options.indicators.rsiPeriod])

  const setDataInternal = (bars: OHLCBar[]): void => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData(
        bars.map((bar) => ({ time: bar.time as Time, open: bar.open, high: bar.high, low: bar.low, close: bar.close })),
      )
    }
    if (lineSeriesRef.current) {
      lineSeriesRef.current.setData(bars.map((bar) => ({ time: bar.time as Time, value: bar.close })))
    }
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(bars.map(toVolumePoint))
    }
  }

  const setData = (bars: OHLCBar[]): void => {
    barsRef.current = bars
    setDataInternal(bars)
    chartRef.current?.timeScale().fitContent()
    recalcIndicators()
  }

  const updateBar = (bar: OHLCBar): void => {
    const bars = barsRef.current
    const lastIndex = bars.length - 1
    if (lastIndex >= 0 && bars[lastIndex].time === bar.time) {
      barsRef.current = [...bars.slice(0, lastIndex), bar]
    } else {
      barsRef.current = [...bars, bar]
    }

    candleSeriesRef.current?.update({ time: bar.time as Time, open: bar.open, high: bar.high, low: bar.low, close: bar.close })
    lineSeriesRef.current?.update({ time: bar.time as Time, value: bar.close })
    volumeSeriesRef.current?.update(toVolumePoint(bar))
    recalcIndicators()
  }

  const setMarkers = (markers: SeriesMarker<Time>[]): void => {
    lastMarkersRef.current = markers
    markersPluginRef.current?.setMarkers(markers)
  }

  const fitContent = (): void => {
    chartRef.current?.timeScale().fitContent()
  }

  return {
    crosshair,
    setData,
    updateBar,
    setMarkers,
    fitContent,
    bollingerLatest,
    rsiLatest,
    chartRef,
    seriesRef: activeSeriesRef,
  }
}

function toSeconds(time: Time): number {
  return typeof time === 'number' ? time : Math.floor(Date.parse(String(time)) / 1000)
}

function toVolumePoint(bar: OHLCBar) {
  return {
    time: bar.time as Time,
    value: bar.volume ?? 0,
    color: bar.close >= bar.open ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.5)',
  }
}

function toLineData(bars: OHLCBar[], values: Array<number | null>): LineData<Time>[] {
  const points: LineData<Time>[] = []
  bars.forEach((bar, index) => {
    const value = values[index]
    if (value !== null && value !== undefined) {
      points.push({ time: bar.time as Time, value })
    }
  })
  return points
}
