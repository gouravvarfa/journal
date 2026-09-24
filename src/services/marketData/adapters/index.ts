/**
 * Broker/vendor adapters live here. None are bundled by default — this repo
 * has no API keys or broker session wiring, and the chart must never show
 * fabricated candles, so no adapter is auto-registered.
 *
 * To go live with a real feed:
 *
 *   import { marketDataService } from '../MarketDataService'
 *   import { ZerodhaKiteAdapter } from './zerodhaKiteAdapter'
 *
 *   marketDataService.setProvider(new ZerodhaKiteAdapter({ apiKey, accessToken }))
 *
 * Call that once during app startup (e.g. in main.tsx, gated behind
 * whatever credential/config check makes sense). Each adapter must
 * implement `MarketDataProvider` and translate `MarketInstrument` into
 * whatever symbol/token format the vendor's API expects
 * (see `providerSymbol` / `providerToken` on `MarketInstrument`).
 */
export {}
