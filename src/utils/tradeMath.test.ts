import { describe, expect, it } from 'vitest'
import { calculateTradeStatus, computePnl, filterTradesByAccount, getNetPnl } from './tradeMath'

describe('trade engine', () => {
  it('computes BUY P/L correctly', () => {
    expect(computePnl({ side: 'BUY', quantity: 10, entryPrice: 100, exitPrice: 120 })).toBe(200)
  })

  it('computes SELL P/L correctly', () => {
    expect(computePnl({ side: 'SELL', quantity: 10, entryPrice: 100, exitPrice: 80 })).toBe(200)
  })

  it('marks open and closed statuses correctly', () => {
    expect(calculateTradeStatus({ exitDate: '', exitPrice: 0 })).toBe('OPEN')
    expect(calculateTradeStatus({ exitDate: '2026-09-08', exitPrice: 120 })).toBe('CLOSED')
  })

  it('isolates trades by account and calculates net P/L', () => {
    const trades = [
      { id: '1', accountId: 'z', side: 'BUY', quantity: 10, entryPrice: 100, exitPrice: 120, exitDate: '2026-09-08', status: 'CLOSED', netPnl: 200 },
      { id: '2', accountId: 'a', side: 'SELL', quantity: 5, entryPrice: 100, exitPrice: 80, exitDate: '2026-09-08', status: 'CLOSED', netPnl: 100 },
    ] as any

    expect(filterTradesByAccount(trades, 'z')).toHaveLength(1)
    expect(getNetPnl(trades)).toBe(300)
  })
})
