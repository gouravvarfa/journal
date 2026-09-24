export type Market = 'NSE' | 'NFO'

export type InstrumentType = 'EQUITY' | 'INDEX' | 'OPTION' | 'FUTURE'

export type OptionType = 'CE' | 'PE'

/**
 * Normalized market instrument. The journal only ever stores a free-text
 * script name (e.g. "NIFTY 23700 CE"); this is the shape every market-data
 * adapter is expected to consume so a broker/provider swap never has to
 * touch chart or journal code.
 */
export interface MarketInstrument {
  symbol: string
  displayName: string
  market: Market
  exchangeSymbol?: string
  instrumentType?: InstrumentType
  expiry?: string
  strike?: number
  optionType?: OptionType
  providerSymbol?: string
  providerToken?: string
}
