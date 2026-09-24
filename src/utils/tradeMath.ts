import type { Trade, TradeSide, TradeStatus } from '../types'

export function computePnl({ side, quantity, entryPrice, exitPrice }: { side: TradeSide; quantity: number; entryPrice: number; exitPrice: number }): number {
  const qty = Number(quantity) || 0
  const entry = Number(entryPrice) || 0
  const exit = Number(exitPrice) || 0

  if (side === 'BUY') {
    return (exit - entry) * qty
  }

  return (entry - exit) * qty
}

export function calculateTradeStatus({ exitDate, exitPrice }: { exitDate: string; exitPrice: number }): TradeStatus {
  if (!exitDate || !exitPrice || Number(exitPrice) <= 0) {
    return 'OPEN'
  }

  return 'CLOSED'
}

export function filterTradesByAccount(trades: Trade[], accountId: string): Trade[] {
  if (!accountId || accountId === 'all') {
    return trades
  }

  return trades.filter((trade) => trade.accountId === accountId)
}

export function getNetPnl(trades: Trade[]): number {
  return trades.reduce((sum, trade) => {
    if (trade.exitPrice > 0 && trade.status === 'CLOSED') {
      return sum + computePnl({
        side: trade.side,
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
      })
    }

    return sum + Number(trade.netPnl || 0)
  }, 0)
}

export function getPnlLabel(value: number): string {
  return value >= 0 ? `+₹${Math.abs(value).toLocaleString('en-IN')}` : `-₹${Math.abs(value).toLocaleString('en-IN')}`
}
