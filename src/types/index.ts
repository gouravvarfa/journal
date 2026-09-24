import type { MarketInstrument } from '../services/marketData/instrumentTypes'

export type TradeSide = 'BUY' | 'SELL'
export type TradingSegment = 'CASH' | 'FUTURES' | 'OPTIONS'
export type TradeStatus = 'OPEN' | 'CLOSED'

export interface Account {
  id: string
  accountName: string
  alias?: string
  brokerName: string
  accountType: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface Trade {
  id: string
  accountId: string
  tradeDate: string
  segment: TradingSegment
  scriptName: string
  reason: string
  quantity: number
  side: TradeSide
  entryPrice: number
  exitDate: string
  exitPrice: number
  status: TradeStatus
  grossPnl: number
  netPnl: number
  notes: string
  createdAt: string
  updatedAt: string
  /**
   * Normalized market instrument, resolved automatically at creation time.
   * Only present on trades created after the chart feature shipped — never
   * backfilled onto older trades, which keep working via on-the-fly
   * resolution when their chart is opened.
   */
  instrument?: MarketInstrument
}

export interface TradeDraft {
  id?: string
  accountId: string
  tradeDate: string
  segment: TradingSegment
  scriptName: string
  reason: string
  quantity: string
  side: TradeSide
  entryPrice: string
  exitDate: string
  exitPrice: string
  notes: string
}

export interface BackupBundle {
  accounts: Account[]
  trades: Trade[]
  settings: Record<string, unknown>
  exportedAt: string
}
