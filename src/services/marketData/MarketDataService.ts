import type { MarketDataProvider } from './MarketDataProvider'

/**
 * Single point of truth for "which market-data provider is active".
 *
 * No adapter ships with this app by default — there is no broker/API key
 * configured — so `getActiveProvider()` returns `null` out of the box and
 * TradingChart shows "Market data connection not configured" instead of
 * ever fabricating candles. Wiring in a real broker adapter later is a
 * one-line `setProvider(new MyBrokerAdapter(...))` call from app startup;
 * nothing in the chart/journal layers needs to change.
 */
class MarketDataService {
  private provider: MarketDataProvider | null = null

  setProvider(provider: MarketDataProvider | null): void {
    this.provider = provider
  }

  getActiveProvider(): MarketDataProvider | null {
    return this.provider
  }

  isConfigured(): boolean {
    return this.provider !== null
  }
}

export const marketDataService = new MarketDataService()
