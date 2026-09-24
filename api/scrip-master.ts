/**
 * Same-origin proxy for Angel One's public instrument master file.
 *
 * That file lives at margincalculator.angelone.in, a domain that (unlike
 * Angel's main apiconnect.angelone.in trading API) sends no
 * Access-Control-Allow-Origin header, so a browser fetch() to it is blocked
 * by CORS no matter how correct the request is. This function runs
 * server-side (Vercel), where CORS doesn't apply, downloads the real file
 * from Angel, filters it down to just NSE/NFO rows the app cares about, and
 * serves it from our own origin so the browser can fetch it normally.
 *
 * No market prices pass through here — this is a symbol/token directory
 * only, refetched from Angel on every request (Vercel edge/CDN caching via
 * the Cache-Control header below keeps it fast without us storing a stale
 * copy that could drift from Angel's real instrument list).
 */

export const config = { runtime: 'edge' }

const SOURCE_URL = 'https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json'
const RELEVANT_TYPES = new Set(['', 'AMXIDX', 'OPTIDX', 'OPTSTK', 'FUTIDX', 'FUTSTK'])

interface RawScripRow {
  token: string
  symbol: string
  name: string
  expiry: string
  strike: string
  exch_seg: string
  instrumenttype: string
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  let upstream: Response
  try {
    upstream = await fetch(SOURCE_URL)
  } catch {
    return new Response(JSON.stringify({ error: 'Unable to reach Angel One instrument list.' }), { status: 502 })
  }

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Angel One instrument list returned HTTP ${upstream.status}.` }), { status: 502 })
  }

  const rows = (await upstream.json()) as RawScripRow[]
  const filtered = rows
    .filter((row) => (row.exch_seg === 'NSE' || row.exch_seg === 'NFO') && RELEVANT_TYPES.has(row.instrumenttype))
    .map((row) => ({
      token: row.token,
      symbol: row.symbol,
      name: row.name,
      expiry: row.expiry,
      strike: row.strike,
      exch_seg: row.exch_seg,
      instrumenttype: row.instrumenttype,
    }))

  return new Response(JSON.stringify(filtered), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Instrument list changes slowly (new listings/expiries) — cache at
      // the edge for an hour, but always allow a manual refresh.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
