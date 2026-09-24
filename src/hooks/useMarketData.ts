import { useEffect, useRef, useState } from 'react'
import type { MarketInstrument, OHLCBar, Timeframe } from '../components/TradingChart/chartTypes'
import { marketDataService } from '../services/marketData/MarketDataService'

export type MarketDataStatus = 'not-configured' | 'loading' | 'ready' | 'empty' | 'error'

export interface UseMarketDataResult {
  status: MarketDataStatus
  bars: OHLCBar[]
  errorMessage: string | null
}

const rangeForTimeframe = (timeframe: Timeframe): { from: number; to: number } => {
  const to = Math.floor(Date.now() / 1000)
  const day = 24 * 60 * 60
  const spanDays: Record<Timeframe, number> = {
    '1m': 1,
    '5m': 3,
    '15m': 7,
    '30m': 14,
    '1H': 30,
    '4H': 90,
    '1D': 365,
    '1W': 365 * 3,
    '1M': 365 * 10,
  }
  return { from: to - spanDays[timeframe] * day, to }
}

/** instrument+timeframe+range -> bars, so switching back to a timeframe already viewed this session is instant. */
const historicalCache = new Map<string, OHLCBar[]>()

const cacheKey = (instrument: MarketInstrument, timeframe: Timeframe, from: number, to: number): string =>
  `${instrument.market}:${instrument.symbol}:${timeframe}:${from}:${to}`

/**
 * Loads historical OHLC for the active provider. Does nothing (and reports
 * `not-configured`) when no `MarketDataProvider` has been registered —
 * this hook never fabricates bars.
 */
export function useMarketData(instrument: MarketInstrument | null, timeframe: Timeframe): UseMarketDataResult {
  const [status, setStatus] = useState<MarketDataStatus>('not-configured')
  const [bars, setBars] = useState<OHLCBar[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!instrument) {
      setStatus('not-configured')
      setBars([])
      return
    }

    const provider = marketDataService.getActiveProvider()
    if (!provider) {
      setStatus('not-configured')
      setBars([])
      return
    }

    const { from, to } = rangeForTimeframe(timeframe)
    const key = cacheKey(instrument, timeframe, from, to)
    const cached = historicalCache.get(key)
    if (cached) {
      setBars(cached)
      setStatus(cached.length === 0 ? 'empty' : 'ready')
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setStatus('loading')
    setErrorMessage(null)

    provider
      .getHistoricalOHLC(instrument, timeframe, from, to)
      .then((result) => {
        if (requestIdRef.current !== requestId) {
          return
        }
        historicalCache.set(key, result)
        setBars(result)
        setStatus(result.length === 0 ? 'empty' : 'ready')
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) {
          return
        }
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load market data.')
      })
  }, [instrument, timeframe])

  return { status, bars, errorMessage }
}
