import type { Trade } from '../types'
import { filterTradesByAccount } from './tradeMath'

export interface JournalFilters {
  search: string
  segment: string
  status: string
  side: string
  pnl: string
  script: string
  startDate: string
  endDate: string
}

export const defaultJournalFilters: JournalFilters = {
  search: '',
  segment: 'all',
  status: 'all',
  side: 'all',
  pnl: 'all',
  script: '',
  startDate: '',
  endDate: '',
}

/**
 * Single source of truth for trade filtering. Every screen (Journal, Dashboard,
 * Stock View, Analytics, Open Trades, Excel/PDF/CSV export) must derive its
 * trade list through this function so results never drift between screens.
 */
export function getFilteredTrades(trades: Trade[], accountId: string, filters: JournalFilters): Trade[] {
  let result = filterTradesByAccount(trades, accountId)

  if (filters.script) {
    result = result.filter((trade) => trade.scriptName === filters.script)
  }

  if (filters.search.trim()) {
    const term = filters.search.trim().toLowerCase()
    result = result.filter(
      (trade) =>
        trade.scriptName.toLowerCase().includes(term) ||
        trade.reason.toLowerCase().includes(term) ||
        trade.notes.toLowerCase().includes(term) ||
        trade.id.toLowerCase().includes(term),
    )
  }

  if (filters.segment !== 'all') {
    result = result.filter((trade) => trade.segment === filters.segment)
  }

  if (filters.status !== 'all') {
    result = result.filter((trade) => trade.status === filters.status)
  }

  if (filters.side !== 'all') {
    result = result.filter((trade) => trade.side === filters.side)
  }

  if (filters.pnl === 'winning') {
    result = result.filter((trade) => trade.status === 'CLOSED' && trade.netPnl > 0)
  } else if (filters.pnl === 'losing') {
    result = result.filter((trade) => trade.status === 'CLOSED' && trade.netPnl < 0)
  }

  if (filters.startDate) {
    result = result.filter((trade) => trade.tradeDate >= filters.startDate)
  }

  if (filters.endDate) {
    result = result.filter((trade) => trade.tradeDate <= filters.endDate)
  }

  return result.slice().sort((left, right) => right.tradeDate.localeCompare(left.tradeDate))
}

export interface ScriptSummary {
  scriptName: string
  totalTrades: number
  openTrades: number
  closedTrades: number
  winningTrades: number
  losingTrades: number
  netPnl: number
  winRate: number
  avgPnl: number
}

/** Groups an already-scoped (account-filtered) trade list by script for the Stocks drill-down. */
export function summarizeByScript(trades: Trade[]): ScriptSummary[] {
  const map = new Map<string, Trade[]>()

  trades.forEach((trade) => {
    const list = map.get(trade.scriptName) ?? []
    list.push(trade)
    map.set(trade.scriptName, list)
  })

  return Array.from(map.entries())
    .map(([scriptName, scriptTrades]) => summarizeTrades(scriptName, scriptTrades))
    .sort((left, right) => right.totalTrades - left.totalTrades)
}

export function summarizeTrades(scriptName: string, trades: Trade[]): ScriptSummary {
  const closed = trades.filter((trade) => trade.status === 'CLOSED')
  const winning = closed.filter((trade) => trade.netPnl > 0)
  const losing = closed.filter((trade) => trade.netPnl < 0)
  const netPnl = closed.reduce((sum, trade) => sum + trade.netPnl, 0)

  return {
    scriptName,
    totalTrades: trades.length,
    openTrades: trades.filter((trade) => trade.status === 'OPEN').length,
    closedTrades: closed.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    netPnl,
    winRate: closed.length ? (winning.length / closed.length) * 100 : 0,
    avgPnl: closed.length ? netPnl / closed.length : 0,
  }
}
