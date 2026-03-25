import type { Asset, StocksMetadata, CryptoMetadata } from '../types'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface CoinGeckoResponse {
  [coinId: string]: { eur?: number }
}

interface YahooFinanceResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number }
    }>
  }
}

interface OpenFIGIResult {
  figi?: string
  ticker?: string
  exchCode?: string
  name?: string
}

interface OpenFIGIResponse {
  data?: OpenFIGIResult[]
  error?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COINGECKO_MAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano',
  DOT: 'polkadot', MATIC: 'matic-network', POL: 'matic-network',
  AVAX: 'avalanche-2', LINK: 'chainlink', UNI: 'uniswap', LTC: 'litecoin',
  XRP: 'ripple', DOGE: 'dogecoin', SHIB: 'shiba-inu', BNB: 'binancecoin',
  USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', ATOM: 'cosmos',
  NEAR: 'near', FTM: 'fantom', OP: 'optimism', ARB: 'arbitrum',
  SUI: 'sui', APT: 'aptos', INJ: 'injective-protocol',
}

// OpenFIGI exchCode → Yahoo Finance suffix
// Prefer exchanges that quote in EUR for European assets
const EXCHANGE_SUFFIX: Record<string, string> = {
  GY: '.DE',   // Xetra (Germany) — most liquid for UCITS ETFs in EUR
  LN: '.L',    // London Stock Exchange
  FP: '.PA',   // Euronext Paris
  SM: '.MC',   // Bolsa de Madrid
  IM: '.MI',   // Borsa Italiana
  NA: '.AS',   // Euronext Amsterdam
  SW: '.SW',   // SIX Swiss Exchange
  SS: '.ST',   // Stockholm
  BB: '.BR',   // Euronext Brussels
  // US exchanges — no suffix needed
  UN: '',      // NYSE
  UQ: '',      // NASDAQ
  UA: '',      // NYSE MKT
  UP: '',      // NYSE ARCA
  UT: '',      // OTC
}

// Priority order when multiple exchanges are returned for the same ISIN
// We want EUR-denominated first, then USD
const EXCHANGE_PRIORITY = ['GY', 'FP', 'SM', 'IM', 'NA', 'LN', 'SW', 'SS', 'BB', 'UN', 'UQ', 'UA', 'UP', 'UT']

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the string looks like a valid ISIN */
export function isISIN(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value.trim().toUpperCase())
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  const coinId = COINGECKO_MAP[symbol.toUpperCase()]
  if (!coinId) return null
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as CoinGeckoResponse
    return data[coinId]?.eur ?? null
  } catch {
    return null
  }
}

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as YahooFinanceResponse
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return typeof price === 'number' ? price : null
  } catch {
    return null
  }
}

/**
 * Resolves an ISIN to a Yahoo Finance ticker via OpenFIGI.
 * Returns { ticker, exchCode } or null if resolution fails.
 * OpenFIGI free tier: 25 req/min, no API key needed.
 */
async function resolveISIN(isin: string): Promise<{ ticker: string; exchCode: string } | null> {
  try {
    const res = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin.toUpperCase() }]),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const raw = (await res.json()) as OpenFIGIResponse[]
    const instruments: OpenFIGIResult[] = raw?.[0]?.data ?? []
    if (instruments.length === 0) return null

    // Pick best exchange by priority
    for (const exchCode of EXCHANGE_PRIORITY) {
      const match = instruments.find(i => i.exchCode === exchCode && i.ticker)
      if (match && match.ticker) {
        return { ticker: match.ticker, exchCode }
      }
    }

    // Fallback: first instrument with a known exchange
    const fallback = instruments.find(i => i.ticker && i.exchCode && EXCHANGE_SUFFIX[i.exchCode] !== undefined)
    if (fallback && fallback.ticker && fallback.exchCode) {
      return { ticker: fallback.ticker, exchCode: fallback.exchCode }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Given a stocks asset, determine the effective Yahoo ticker to use.
 * - If identifierType=ticker: use symbol directly
 * - If identifierType=isin: use resolvedTicker if cached, else resolve via OpenFIGI
 * Returns { yahooTicker, resolvedTicker } where resolvedTicker is set when ISIN was resolved
 * (so it can be cached in metadata by the caller).
 */
async function resolveStockTicker(
  symbol: string,
  meta: StocksMetadata
): Promise<{ yahooTicker: string; resolvedTickerToCache?: string } | null> {
  const identifierType = meta.identifierType ?? (isISIN(symbol) ? 'isin' : 'ticker')

  if (identifierType === 'ticker') {
    return { yahooTicker: symbol }
  }

  // ISIN path
  // Use cached resolvedTicker if available
  if (meta.resolvedTicker) {
    return { yahooTicker: meta.resolvedTicker }
  }

  // Resolve via OpenFIGI
  const resolved = await resolveISIN(symbol)
  if (!resolved) return null

  const suffix = EXCHANGE_SUFFIX[resolved.exchCode] ?? ''
  const yahooTicker = resolved.ticker + suffix

  return { yahooTicker, resolvedTickerToCache: yahooTicker }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface PriceUpdateResult {
  /** Map of assetId → new total EUR value */
  values: Map<string, number>
  /** Map of assetId → resolvedTicker to cache in metadata */
  resolvedTickers: Map<string, string>
}

/**
 * Fetches updated prices for all assets with symbols.
 * Returns both updated values and any newly resolved tickers (from ISIN resolution)
 * so the caller can persist them in metadata.
 */
export async function updateAssetPrices(assets: Asset[]): Promise<PriceUpdateResult> {
  const values = new Map<string, number>()
  const resolvedTickers = new Map<string, string>()

  const cryptoAssets = assets.filter(a => a.category === 'crypto' && a.symbol)
  const stockAssets = assets.filter(
    a => a.category === 'stocks' && a.symbol && (a.metadata as StocksMetadata | undefined)?.canAutoUpdate !== false
  )

  // ── Crypto ──
  const cryptoSymbols = [...new Set(cryptoAssets.map(a => a.symbol!.toUpperCase()))]
  const cryptoPrices = new Map<string, number>()
  await Promise.allSettled(
    cryptoSymbols.map(async sym => {
      const price = await fetchCryptoPrice(sym)
      if (price !== null) cryptoPrices.set(sym, price)
    })
  )
  for (const asset of cryptoAssets) {
    const price = cryptoPrices.get(asset.symbol!.toUpperCase())
    if (price === undefined) continue
    const meta = asset.metadata as CryptoMetadata | undefined
    const quantity = meta?.quantity
    if (!quantity || quantity <= 0) continue
    values.set(asset.id, quantity * price)
  }

  // ── Stocks (sequential for ISIN resolution to avoid rate limiting OpenFIGI) ──
  for (const asset of stockAssets) {
    const meta = (asset.metadata ?? {}) as StocksMetadata
    const quantity = meta.quantity
    if (!quantity || quantity <= 0) continue

    const resolution = await resolveStockTicker(asset.symbol!.toUpperCase(), meta)
    if (!resolution) continue

    const { yahooTicker, resolvedTickerToCache } = resolution
    const price = await fetchYahooPrice(yahooTicker)
    if (price === null) continue

    values.set(asset.id, quantity * price)
    if (resolvedTickerToCache) {
      resolvedTickers.set(asset.id, resolvedTickerToCache)
    }
  }

  return { values, resolvedTickers }
}

/** Fetch a single price for preview (used in form). */
export async function fetchPriceForIdentifier(
  category: 'stocks' | 'crypto',
  identifier: string,
  identifierType: 'ticker' | 'isin' = 'ticker'
): Promise<{ price: number; resolvedTicker?: string } | null> {
  if (category === 'crypto') {
    const price = await fetchCryptoPrice(identifier)
    return price !== null ? { price } : null
  }

  if (identifierType === 'isin' || isISIN(identifier)) {
    const resolved = await resolveISIN(identifier)
    if (!resolved) return null
    const suffix = EXCHANGE_SUFFIX[resolved.exchCode] ?? ''
    const yahooTicker = resolved.ticker + suffix
    const price = await fetchYahooPrice(yahooTicker)
    return price !== null ? { price, resolvedTicker: yahooTicker } : null
  }

  const price = await fetchYahooPrice(identifier)
  return price !== null ? { price } : null
}

// Keep old export for backwards compatibility
export async function fetchPricePerUnit(category: 'crypto' | 'stocks', symbol: string): Promise<number | null> {
  const result = await fetchPriceForIdentifier(category, symbol)
  return result?.price ?? null
}

