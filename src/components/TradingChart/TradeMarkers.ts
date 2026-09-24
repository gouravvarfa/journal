import type { SeriesMarker, Time } from 'lightweight-charts'
import type { Trade } from '../../types'
import type { ChartTradeMarker, OHLCBar } from './chartTypes'

const toUnixSeconds = (dateString: string): number | null => {
  if (!dateString) {
    return null
  }
  const ms = Date.parse(dateString)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

/** Snaps a raw timestamp to the nearest bar time so the marker always lands on a real candle. */
const nearestBarTime = (targetSeconds: number, bars: OHLCBar[]): number | null => {
  if (bars.length === 0) {
    return null
  }

  let closest = bars[0]
  let closestDiff = Math.abs(bars[0].time - targetSeconds)

  for (const bar of bars) {
    const diff = Math.abs(bar.time - targetSeconds)
    if (diff < closestDiff) {
      closest = bar
      closestDiff = diff
    }
  }

  return closest.time
}

/**
 * Builds entry/exit chart markers strictly from trades already scoped to
 * `accountId + scriptName` by the caller — this function does no filtering
 * of its own, so account isolation is enforced by whoever selects `trades`.
 */
export function buildTradeMarkers(trades: Trade[], bars: OHLCBar[]): ChartTradeMarker[] {
  const markers: ChartTradeMarker[] = []

  trades.forEach((trade) => {
    const entrySeconds = toUnixSeconds(trade.tradeDate)
    const entryTime = entrySeconds === null ? null : nearestBarTime(entrySeconds, bars)

    if (entryTime !== null) {
      markers.push({
        tradeId: trade.id,
        accountId: trade.accountId,
        kind: 'ENTRY',
        time: entryTime,
        price: trade.entryPrice,
        side: trade.side,
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        netPnl: trade.netPnl,
        status: trade.status,
        tradeDate: trade.tradeDate,
        exitDate: trade.exitDate,
      })
    }

    if (trade.status === 'CLOSED' && trade.exitDate) {
      const exitSeconds = toUnixSeconds(trade.exitDate)
      const exitTime = exitSeconds === null ? null : nearestBarTime(exitSeconds, bars)

      if (exitTime !== null) {
        markers.push({
          tradeId: trade.id,
          accountId: trade.accountId,
          kind: 'EXIT',
          time: exitTime,
          price: trade.exitPrice,
          side: trade.side,
          quantity: trade.quantity,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          netPnl: trade.netPnl,
          status: trade.status,
          tradeDate: trade.tradeDate,
          exitDate: trade.exitDate,
        })
      }
    }
  })

  return markers
}

/** Converts our normalized trade markers into lightweight-charts' SeriesMarker shape. */
export function toSeriesMarkers(markers: ChartTradeMarker[]): SeriesMarker<Time>[] {
  return markers
    .slice()
    .sort((left, right) => left.time - right.time)
    .map((marker) => {
      const isEntry = marker.kind === 'ENTRY'
      const isBuy = marker.side === 'BUY'

      return {
        time: marker.time as Time,
        position: isEntry ? (isBuy ? 'belowBar' : 'aboveBar') : isBuy ? 'aboveBar' : 'belowBar',
        shape: isEntry ? (isBuy ? 'arrowUp' : 'arrowDown') : isBuy ? 'arrowDown' : 'arrowUp',
        color: isEntry ? '#2563EB' : marker.netPnl >= 0 ? '#16A34A' : '#DC2626',
        id: `${marker.tradeId}-${marker.kind}`,
        text: isEntry ? `${marker.side} ₹${marker.entryPrice}` : `EXIT ₹${marker.exitPrice}`,
      } satisfies SeriesMarker<Time>
    })
}
