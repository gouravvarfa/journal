import type { MarketInstrument } from './instrumentTypes'

interface RegistryEntry {
  symbol: string
  displayName: string
  instrumentType: 'EQUITY' | 'INDEX'
  aliases: string[]
}

/**
 * Starter NSE registry: real company-name → trading-symbol mappings for the
 * most commonly journaled names/indices. This is normalization data, not
 * market data — no prices, no candles. Extend this list (or replace it with
 * a full NSE instrument dump fetched from a broker adapter) as needed;
 * nothing else in the resolver needs to change.
 */
const REGISTRY: RegistryEntry[] = [
  { symbol: 'RELIANCE', displayName: 'Reliance Industries', instrumentType: 'EQUITY', aliases: ['reliance', 'reliance industries', 'ril'] },
  { symbol: 'TCS', displayName: 'Tata Consultancy Services', instrumentType: 'EQUITY', aliases: ['tcs', 'tata consultancy', 'tata consultancy services'] },
  { symbol: 'INFY', displayName: 'Infosys', instrumentType: 'EQUITY', aliases: ['infy', 'infosys'] },
  { symbol: 'SBIN', displayName: 'State Bank of India', instrumentType: 'EQUITY', aliases: ['sbin', 'sbi', 'state bank of india', 'state bank'] },
  { symbol: 'HDFCBANK', displayName: 'HDFC Bank', instrumentType: 'EQUITY', aliases: ['hdfcbank', 'hdfc bank', 'hdfc'] },
  { symbol: 'RBLBANK', displayName: 'RBL Bank', instrumentType: 'EQUITY', aliases: ['rblbank', 'rbl bank', 'rbl'] },
  { symbol: 'ICICIBANK', displayName: 'ICICI Bank', instrumentType: 'EQUITY', aliases: ['icicibank', 'icici bank', 'icici'] },
  { symbol: 'AXISBANK', displayName: 'Axis Bank', instrumentType: 'EQUITY', aliases: ['axisbank', 'axis bank', 'axis'] },
  { symbol: 'KOTAKBANK', displayName: 'Kotak Mahindra Bank', instrumentType: 'EQUITY', aliases: ['kotakbank', 'kotak bank', 'kotak mahindra bank', 'kotak'] },
  { symbol: 'ITC', displayName: 'ITC', instrumentType: 'EQUITY', aliases: ['itc'] },
  { symbol: 'WIPRO', displayName: 'Wipro', instrumentType: 'EQUITY', aliases: ['wipro'] },
  { symbol: 'HCLTECH', displayName: 'HCL Technologies', instrumentType: 'EQUITY', aliases: ['hcltech', 'hcl tech', 'hcl technologies'] },
  { symbol: 'LT', displayName: 'Larsen & Toubro', instrumentType: 'EQUITY', aliases: ['lt', 'l&t', 'larsen', 'larsen and toubro', 'larsen & toubro'] },
  { symbol: 'MARUTI', displayName: 'Maruti Suzuki', instrumentType: 'EQUITY', aliases: ['maruti', 'maruti suzuki'] },
  { symbol: 'TATAMOTORS', displayName: 'Tata Motors', instrumentType: 'EQUITY', aliases: ['tatamotors', 'tata motors'] },
  { symbol: 'BAJFINANCE', displayName: 'Bajaj Finance', instrumentType: 'EQUITY', aliases: ['bajfinance', 'bajaj finance'] },
  { symbol: 'SUNPHARMA', displayName: 'Sun Pharma', instrumentType: 'EQUITY', aliases: ['sunpharma', 'sun pharma'] },
  { symbol: 'ADANIENT', displayName: 'Adani Enterprises', instrumentType: 'EQUITY', aliases: ['adanient', 'adani enterprises', 'adani ent'] },
  { symbol: 'ASIANPAINT', displayName: 'Asian Paints', instrumentType: 'EQUITY', aliases: ['asianpaint', 'asian paints', 'asian paint'] },
  { symbol: 'NIFTY', displayName: 'Nifty 50', instrumentType: 'INDEX', aliases: ['nifty', 'nifty50', 'nifty 50'] },
  { symbol: 'BANKNIFTY', displayName: 'Nifty Bank', instrumentType: 'INDEX', aliases: ['banknifty', 'bank nifty', 'nifty bank'] },
  { symbol: 'FINNIFTY', displayName: 'Nifty Financial Services', instrumentType: 'INDEX', aliases: ['finnifty', 'fin nifty', 'nifty financial services'] },
]

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ')

const toEquityInstrument = (entry: RegistryEntry): MarketInstrument => ({
  symbol: entry.symbol,
  displayName: entry.displayName,
  market: 'NSE',
  exchangeSymbol: entry.symbol,
  instrumentType: entry.instrumentType,
})

export interface AmbiguousResolution {
  ambiguous: true
  query: string
  candidates: MarketInstrument[]
}

export type ResolveResult = MarketInstrument | AmbiguousResolution | null

const NFO_OPTION_PATTERN = /^([A-Z&]+)\s+(\d+(?:\.\d+)?)\s*(CE|PE)$/
const NFO_FUTURE_PATTERN = /^([A-Z&]+)\s+FUT(?:URES?)?$/

/**
 * Parses an NFO-style script string ("NIFTY 23700 CE", "RELIANCE FUT") into
 * a normalized option/future instrument. Returns null if the string doesn't
 * match an NFO derivative shape at all.
 */
function parseNfoInstrument(raw: string): MarketInstrument | null {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, ' ')

  const optionMatch = upper.match(NFO_OPTION_PATTERN)
  if (optionMatch) {
    const [, underlying, strikeText, optionType] = optionMatch
    return {
      symbol: `${underlying} ${strikeText} ${optionType}`,
      displayName: raw.trim().replace(/\s+/g, ' '),
      market: 'NFO',
      exchangeSymbol: underlying,
      instrumentType: 'OPTION',
      strike: Number(strikeText),
      optionType: optionType as 'CE' | 'PE',
    }
  }

  const futureMatch = upper.match(NFO_FUTURE_PATTERN)
  if (futureMatch) {
    const [, underlying] = futureMatch
    return {
      symbol: `${underlying} FUT`,
      displayName: raw.trim().replace(/\s+/g, ' '),
      market: 'NFO',
      exchangeSymbol: underlying,
      instrumentType: 'FUTURE',
    }
  }

  return null
}

/**
 * Resolves a free-text journal script name into a normalized market
 * instrument. Order of resolution:
 *   1. NFO derivative shape (options/futures) — market = NFO
 *   2. Exact alias match in the equity/index registry — market = NSE
 *   3. Ambiguous partial match (2+ candidates) — caller must prompt the user
 *   4. Unresolved — caller falls back to the raw display name only
 */
export function resolveInstrument(rawInput: string): ResolveResult {
  const trimmed = rawInput.trim()
  if (!trimmed) {
    return null
  }

  const nfoMatch = parseNfoInstrument(trimmed)
  if (nfoMatch) {
    return nfoMatch
  }

  const normalized = normalize(trimmed)

  const exact = REGISTRY.find((entry) => entry.aliases.includes(normalized) || normalize(entry.symbol) === normalized)
  if (exact) {
    return toEquityInstrument(exact)
  }

  const partialMatches = REGISTRY.filter((entry) =>
    entry.aliases.some((alias) => alias.includes(normalized) || normalized.includes(alias)),
  )

  if (partialMatches.length === 1) {
    return toEquityInstrument(partialMatches[0])
  }

  if (partialMatches.length > 1) {
    return {
      ambiguous: true,
      query: trimmed,
      candidates: partialMatches.map(toEquityInstrument),
    }
  }

  return null
}

/** Fallback instrument for scripts the resolver can't map — chart still opens, just unresolved. */
export function fallbackInstrument(rawInput: string): MarketInstrument {
  const nfoMatch = parseNfoInstrument(rawInput)
  if (nfoMatch) {
    return nfoMatch
  }

  return {
    symbol: rawInput.trim().toUpperCase(),
    displayName: rawInput.trim(),
    market: 'NSE',
    instrumentType: 'EQUITY',
  }
}
