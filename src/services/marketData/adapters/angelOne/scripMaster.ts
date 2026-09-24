import { db, type InstrumentCacheRecord } from '../../../../database/db'
import type { MarketInstrument } from '../../instrumentTypes'

/**
 * Angel One's own public instrument master (symbol/name -> exchange token).
 * No auth required, no market prices in it — just a symbol directory, so
 * fetching it is not "market data" and doesn't touch the no-fake-data rule.
 *
 * The real file lives at margincalculator.angelone.in, which sends no CORS
 * headers, so a browser can't fetch it directly (unlike apiconnect.angelone.in,
 * which does support browser calls). `/api/scrip-master` is a same-origin
 * Vercel function (api/scrip-master.ts) that fetches the real file
 * server-side and re-serves it — no CORS restriction applies server-to-server.
 */
const SCRIP_MASTER_URL = '/api/scrip-master'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface RawScripRow {
  token: string
  symbol: string
  name: string
  expiry: string
  strike: string
  exch_seg: string
  instrumenttype: string
}

const RELEVANT_TYPES = new Set(['', 'AMXIDX', 'OPTIDX', 'OPTSTK', 'FUTIDX', 'FUTSTK'])

async function isCacheFresh(): Promise<boolean> {
  const sample = await db.instrumentCache.limit(1).toArray()
  if (sample.length === 0) {
    return false
  }
  const fetchedAt = new Date(sample[0].fetchedAt).getTime()
  return Date.now() - fetchedAt < CACHE_TTL_MS
}

async function refreshCache(): Promise<void> {
  const response = await fetch(SCRIP_MASTER_URL)
  if (!response.ok) {
    throw new Error('Unable to download Angel One instrument list.')
  }
  const rows = (await response.json()) as RawScripRow[]
  const now = new Date().toISOString()

  const records: InstrumentCacheRecord[] = rows
    .filter((row) => (row.exch_seg === 'NSE' || row.exch_seg === 'NFO') && RELEVANT_TYPES.has(row.instrumenttype))
    .map((row) => ({
      key: row.token,
      token: row.token,
      symbol: row.symbol,
      name: row.name,
      expiry: row.expiry,
      strike: Number(row.strike) / 100,
      exchSeg: row.exch_seg,
      instrumentType: row.instrumenttype,
      fetchedAt: now,
    }))

  await db.instrumentCache.clear()
  await db.instrumentCache.bulkPut(records)
}

export async function ensureScripMasterLoaded(forceRefresh = false): Promise<void> {
  if (!forceRefresh && (await isCacheFresh())) {
    return
  }
  await refreshCache()
}

export interface ScripMatch {
  token: string
  tradingSymbol: string
  exchSeg: 'NSE' | 'NFO'
}

export interface ExpiryAmbiguity {
  ambiguous: true
  expiries: string[]
}

/**
 * Resolves a normalized MarketInstrument to Angel One's exchange + token +
 * trading symbol. For NFO options/futures with more than one live expiry
 * and no expiry explicitly chosen, returns the list of available expiries
 * instead of guessing — the caller must ask the user to pick one.
 */
export async function resolveAngelOneScrip(instrument: MarketInstrument, chosenExpiry?: string): Promise<ScripMatch | ExpiryAmbiguity | null> {
  await ensureScripMasterLoaded()

  if (instrument.market === 'NSE') {
    const candidates = await db.instrumentCache
      .where('name')
      .equals(instrument.exchangeSymbol ?? instrument.symbol)
      .and((row) => row.exchSeg === 'NSE')
      .toArray()

    const equity = candidates.find((row) => row.instrumentType === '' && row.symbol.endsWith('-EQ'))
    const index = candidates.find((row) => row.instrumentType === 'AMXIDX')
    const match = instrument.instrumentType === 'INDEX' ? index ?? equity : equity ?? index

    if (!match) {
      return null
    }
    return { token: match.token, tradingSymbol: match.symbol, exchSeg: 'NSE' }
  }

  // NFO: option or future
  const underlying = instrument.exchangeSymbol ?? instrument.symbol
  const candidates = await db.instrumentCache
    .where('name')
    .equals(underlying)
    .and((row) => row.exchSeg === 'NFO')
    .and((row) => {
      if (instrument.instrumentType === 'FUTURE') {
        return row.instrumentType === 'FUTSTK' || row.instrumentType === 'FUTIDX'
      }
      const isOption = row.instrumentType === 'OPTSTK' || row.instrumentType === 'OPTIDX'
      if (!isOption || instrument.strike === undefined) {
        return false
      }
      return Math.abs(row.strike - instrument.strike) < 0.01 && row.symbol.endsWith(instrument.optionType ?? '')
    })
    .toArray()

  if (candidates.length === 0) {
    return null
  }

  if (chosenExpiry) {
    const exact = candidates.find((row) => row.expiry === chosenExpiry)
    if (!exact) {
      return null
    }
    return { token: exact.token, tradingSymbol: exact.symbol, exchSeg: 'NFO' }
  }

  const distinctExpiries = Array.from(new Set(candidates.map((row) => row.expiry))).sort()
  if (distinctExpiries.length > 1) {
    return { ambiguous: true, expiries: distinctExpiries }
  }

  const only = candidates[0]
  return { token: only.token, tradingSymbol: only.symbol, exchSeg: 'NFO' }
}
