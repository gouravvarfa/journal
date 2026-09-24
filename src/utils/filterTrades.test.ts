import { describe, expect, it } from 'vitest'
import { defaultJournalFilters, getFilteredTrades, summarizeByScript } from './filterTrades'
import type { Trade } from '../types'

const makeTrade = (overrides: Partial<Trade>): Trade => ({
  id: crypto.randomUUID(),
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

describe('acceptance test: account + stock isolation', () => {
  const trades: Trade[] = [
    ...Array.from({ length: 5 }, () => makeTrade({ accountId: 'AG', scriptName: 'NIFTY' })),
    ...Array.from({ length: 3 }, () => makeTrade({ accountId: 'AG', scriptName: 'BANKNIFTY' })),
    ...Array.from({ length: 7 }, () => makeTrade({ accountId: 'ZP', scriptName: 'NIFTY' })),
    ...Array.from({ length: 2 }, () => makeTrade({ accountId: 'ZP', scriptName: 'BANKNIFTY' })),
  ]

  it('AG -> NIFTY returns exactly 5 trades', () => {
    const result = getFilteredTrades(trades, 'AG', { ...defaultJournalFilters, script: 'NIFTY' })
    expect(result).toHaveLength(5)
    expect(result.every((trade) => trade.accountId === 'AG' && trade.scriptName === 'NIFTY')).toBe(true)
  })

  it('ZP -> NIFTY returns exactly 7 trades', () => {
    const result = getFilteredTrades(trades, 'ZP', { ...defaultJournalFilters, script: 'NIFTY' })
    expect(result).toHaveLength(7)
    expect(result.every((trade) => trade.accountId === 'ZP' && trade.scriptName === 'NIFTY')).toBe(true)
  })

  it('All Accounts -> NIFTY returns exactly 12 trades', () => {
    const result = getFilteredTrades(trades, 'all', { ...defaultJournalFilters, script: 'NIFTY' })
    expect(result).toHaveLength(12)
  })

  it('never leaks another account into a scoped view', () => {
    const result = getFilteredTrades(trades, 'AG', { ...defaultJournalFilters, script: 'NIFTY' })
    expect(result.some((trade) => trade.accountId === 'ZP')).toBe(false)
  })

  it('summarizeByScript groups per account scope only', () => {
    const agTrades = trades.filter((trade) => trade.accountId === 'AG')
    const summary = summarizeByScript(agTrades)
    const nifty = summary.find((row) => row.scriptName === 'NIFTY')
    const bankNifty = summary.find((row) => row.scriptName === 'BANKNIFTY')
    expect(nifty?.totalTrades).toBe(5)
    expect(bankNifty?.totalTrades).toBe(3)
  })

  it('combines all active filters (account + script + status)', () => {
    const mixed: Trade[] = [
      makeTrade({ accountId: 'AG', scriptName: 'NIFTY', status: 'OPEN', exitDate: '', exitPrice: 0, netPnl: 0 }),
      makeTrade({ accountId: 'AG', scriptName: 'NIFTY', status: 'CLOSED' }),
    ]
    const result = getFilteredTrades(mixed, 'AG', { ...defaultJournalFilters, script: 'NIFTY', status: 'CLOSED' })
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('CLOSED')
  })
})
