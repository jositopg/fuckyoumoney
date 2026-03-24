import type { Asset } from '../types'

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

const COINGECKO_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ADA: 'cardano',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  POL: 'matic-network',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  LTC: 'litecoin',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  BNB: 'binancecoin',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  ATOM: 'cosmos',
  NEAR: 'near',
  FTM: 'fantom',
  OP: 'optimism',
  ARB: 'arbitrum',
  SUI: 'sui',
  APT: 'aptos',
  INJ: 'injective-protocol',
}

async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  const coinId = COINGECKO_MAP[symbol.toUpperCase()]
  if (!coinId) return null

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as CoinGeckoResponse
    return data[coinId]?.eur ?? null
  } catch {
    return null
  }
}

async function fetchStockPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
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
 * Fetches updated prices for assets with symbols.
 * Convention: each asset with a symbol represents 1 unit at the current market price.
 * Returns a map of assetId -> new price in EUR.
 */
export async function updateAssetPrices(assets: Asset[]): Promise<Map<string, number>> {
  const updates = new Map<string, number>()

  const cryptoAssets = assets.filter(a => a.category === 'crypto' && a.symbol)
  const stockAssets = assets.filter(a => a.category === 'stocks' && a.symbol)

  // Fetch crypto prices (deduplicated by symbol)
  const cryptoSymbols = [...new Set(cryptoAssets.map(a => a.symbol!.toUpperCase()))]
  const cryptoPrices = new Map<string, number>()

  await Promise.allSettled(
    cryptoSymbols.map(async sym => {
      const price = await fetchCryptoPrice(sym)
      if (price !== null) cryptoPrices.set(sym, price)
    })
  )

  // Fetch stock prices (deduplicated by symbol)
  const stockSymbols = [...new Set(stockAssets.map(a => a.symbol!.toUpperCase()))]
  const stockPrices = new Map<string, number>()

  await Promise.allSettled(
    stockSymbols.map(async sym => {
      const price = await fetchStockPrice(sym)
      if (price !== null) stockPrices.set(sym, price)
    })
  )

  for (const asset of cryptoAssets) {
    const price = cryptoPrices.get(asset.symbol!.toUpperCase())
    if (price !== undefined) updates.set(asset.id, price)
  }

  for (const asset of stockAssets) {
    const price = stockPrices.get(asset.symbol!.toUpperCase())
    if (price !== undefined) updates.set(asset.id, price)
  }

  return updates
}
