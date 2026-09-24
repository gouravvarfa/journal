import type { MarketInstrument } from '../../services/marketData/instrumentTypes'

export type { Market, InstrumentType, OptionType, MarketInstrument } from '../../services/marketData/instrumentTypes'

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D' | '1W' | '1M'

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W', '1M']

export type ChartType = 'candlestick' | 'line'

export interface IndicatorSettings {
  rsi: boolean
  rsiPeriod: number
  bollinger: boolean
  bollingerPeriod: number
  bollingerMultiplier: number
  volume: boolean
}

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
  rsi: false,
  rsiPeriod: 14,
  bollinger: false,
  bollingerPeriod: 20,
  bollingerMultiplier: 2,
  volume: true,
}

export interface OHLCBar {
  /** Unix seconds (UTC) — matches lightweight-charts' UTCTimestamp. */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface Quote {
  price: number
  change: number
  changePercent: number
  timestamp: number
}

export interface ChartTradeMarker {
  tradeId: string
  accountId: string
  kind: 'ENTRY' | 'EXIT'
  time: number
  price: number
  side: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  exitPrice: number
  netPnl: number
  status: 'OPEN' | 'CLOSED'
  tradeDate: string
  exitDate: string
}

export interface ChartState {
  isOpen: boolean
  instrument: MarketInstrument | null
  accountId: string
  tradeId?: string
  isMaximized: boolean
}
