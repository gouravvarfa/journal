import { describe, expect, it } from 'vitest'
import { buildTradeMarkers, toSeriesMarkers } from './TradeMarkers'
import type { Trade } from '../../types'
import type { OHLCBar } from './chartTypes'

const makeTrade = (overrides: Partial<Trade>): Trade => ({
  id: 't1',
  accountId: 'AG',
  tradeDate: '2026-09-05',
  segment: 'OPTIONS',
  scriptName: 'NIFTY',
  reason: 'Trend',
  quantity: 10,
  side: 'BUY',
  entryPrice: 100,
  exitDate: '2026-09-06',
  exitPrice: 120,
  status: 'CLOSED',
  grossPnl: 200,
  netPnl: 200,
  notes: '',
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

const daySeconds = (dateString: string): number => Math.floor(Date.parse(dateString) / 1000)

describe('trade markers', () => {
  const bars: OHLCBar[] = [
    { time: daySeconds('2026-09-04'), open: 90, high: 95, low: 88, close: 92 },
    { time: daySeconds('2026-09-05'), open: 92, high: 105, low: 90, close: 100 },
    { time: daySeconds('2026-09-06'), open: 100, high: 125, low: 98, close: 120 },
  ]

  it('creates an ENTRY and EXIT marker for a closed trade, snapped to real candle times', () => {
    const markers = buildTradeMarkers([makeTrade({})], bars)
    expect(markers).toHaveLength(2)

    const entry = markers.find((marker) => marker.kind === 'ENTRY')
    const exit = markers.find((marker) => marker.kind === 'EXIT')

    expect(entry?.time).toBe(daySeconds('2026-09-05'))
    expect(exit?.time).toBe(daySeconds('2026-09-06'))
    expect(entry?.price).toBe(100)
    expect(exit?.price).toBe(120)
  })

  it('creates only an ENTRY marker for an open trade', () => {
    const markers = buildTradeMarkers(
      [makeTrade({ status: 'OPEN', exitDate: '', exitPrice: 0, netPnl: 0 })],
      bars,
    )
    expect(markers).toHaveLength(1)
    expect(markers[0].kind).toBe('ENTRY')
  })

  it('never fabricates markers for trades not passed in (caller enforces account/script isolation)', () => {
    const agTrade = makeTrade({ id: 'a1', accountId: 'AG' })
    const markers = buildTradeMarkers([agTrade], bars)
    expect(markers.every((marker) => marker.accountId === 'AG')).toBe(true)
    expect(markers.some((marker) => marker.accountId === 'ZP')).toBe(false)
  })

  it('converts to lightweight-charts SeriesMarker shape with stable ids', () => {
    const markers = buildTradeMarkers([makeTrade({})], bars)
    const seriesMarkers = toSeriesMarkers(markers)
    expect(seriesMarkers).toHaveLength(2)
    expect(seriesMarkers[0].id).toBe('t1-ENTRY')
    expect(seriesMarkers[1].id).toBe('t1-EXIT')
  })
})
