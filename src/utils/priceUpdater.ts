import type { Asset, StocksMetadata, CryptoMetadata, CashMetadata, CommodityMetadata } from '../types'

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

const TROY_OZ_IN_GRAMS = 31.1035

// Yahoo Finance futures tickers for precious metals (quoted in USD/troy oz)
const COMMODITY_YAHOO_TICKERS: Record<string, string> = {
  oro: 'GC=F',
  plata: 'SI=F',
  platino: 'PL=F',
  paladio: 'PA=F',
}

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

  // ── Commodities (Yahoo Finance futures → USD/troy oz → EUR → per unit) ──
  const commodityAssets = assets.filter(a => {
    if (a.category !== 'commodities') return false
    const meta = a.metadata as CommodityMetadata | undefined
    return !!meta?.commodityType && meta.commodityType !== 'otro' && !!meta?.quantity && meta.quantity > 0
  })
  if (commodityAssets.length > 0) {
    const eurusd = await fetchYahooPrice('EURUSD=X')
    if (eurusd !== null && eurusd > 0) {
      const uniqueTickers = [...new Set(
        commodityAssets
          .map(a => COMMODITY_YAHOO_TICKERS[(a.metadata as CommodityMetadata).commodityType!])
          .filter(Boolean)
      )]
      const commodityPricesUsd = new Map<string, number>()
      await Promise.allSettled(
        uniqueTickers.map(async ticker => {
          const price = await fetchYahooPrice(ticker)
          if (price !== null) commodityPricesUsd.set(ticker, price)
        })
      )
      for (const asset of commodityAssets) {
        const meta = asset.metadata as CommodityMetadata
        const ticker = COMMODITY_YAHOO_TICKERS[meta.commodityType!]
        const priceUsdPerOz = commodityPricesUsd.get(ticker)
        if (priceUsdPerOz === undefined) continue
        const priceEurPerOz = priceUsdPerOz / eurusd
        let priceEurPerUnit: number
        switch (meta.unit) {
          case 'g':  priceEurPerUnit = priceEurPerOz / TROY_OZ_IN_GRAMS; break
          case 'kg': priceEurPerUnit = (priceEurPerOz / TROY_OZ_IN_GRAMS) * 1000; break
          default:   priceEurPerUnit = priceEurPerOz; break // 'oz' or undefined
        }
        values.set(asset.id, meta.quantity! * priceEurPerUnit)
      }
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

/**
 * Applies daily compound interest to cash accounts with an interestRate set.
 * Uses the lastInterestUpdate (or updatedAt as fallback) to compute elapsed days.
 * Returns the same array reference if nothing changed.
 */
export function applyDailyInterest(assets: Asset[]): Asset[] {
  const now = new Date()
  let changed = false
  const updated = assets.map(asset => {
    if (asset.category !== 'cash') return asset
    const meta = asset.metadata as CashMetadata | undefined
    if (!meta?.interestRate || meta.interestRate <= 0) return asset

    const lastUpdate = meta.lastInterestUpdate ?? asset.updatedAt
    const daysDiff = (now.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff < 1) return asset

    const newValue = asset.value * Math.pow(1 + meta.interestRate / 100, daysDiff / 365)
    changed = true
    return {
      ...asset,
      value: Math.round(newValue * 100) / 100,
      metadata: { ...meta, lastInterestUpdate: now.toISOString() } as CashMetadata,
      updatedAt: now.toISOString(),
    }
  })
  return changed ? updated : assets
}

