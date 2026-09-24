import type { MarketInstrument, OHLCBar, Quote, Timeframe } from '../../components/TradingChart/chartTypes'

/**
 * Every broker/vendor integration implements this interface. TradingChart
 * and the rest of the app never talk to a broker API directly — only
 * through this contract — so a provider can be swapped or added later
 * without touching chart or journal code.
 */
export interface MarketDataProvider {
  /** Human-readable name shown in diagnostics, e.g. "Zerodha Kite". */
  readonly name: string

  getHistoricalOHLC(instrument: MarketInstrument, timeframe: Timeframe, from: number, to: number): Promise<OHLCBar[]>

  getLatestQuote(instrument: MarketInstrument): Promise<Quote>

  /**
   * Subscribes to realtime bar updates for an instrument/timeframe.
   * Must return an unsubscribe function that fully tears down the feed.
   */
  subscribeToRealtime(instrument: MarketInstrument, timeframe: Timeframe, callback: (bar: OHLCBar) => void): () => void
}
