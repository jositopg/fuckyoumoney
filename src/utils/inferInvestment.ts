import type { InvestAssetClass, InvestRegion, StockKind } from '../types'
import { isISIN } from './priceUpdater'

export interface InferredInvestment {
  isInvestment: boolean
  category: 'stocks' | 'crypto' | 'pension' | null
  assetType?: StockKind
  region?: InvestRegion
  assetClass?: InvestAssetClass
  ticker?: string
  isin?: string
  broker?: string
}

const ISIN_IN_TEXT = /\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/i
const TICKER_IN_TEXT = /\b([A-Z]{2,5}(?:\.[A-Z]{1,4})?)\b/

const FUND_NAME =
  /\b(etf|etfs|fondo|fondos|indexa|inbestme|vanguard|ishares|amundi|spdr|xtrackers|lyxor|numantia|bestinver|azvalor|cobas|magallanes|finizens|indexado|sicav|\bfi\b|vwce|iwda|swda|spyi|csspx|msci)\b/i
const CRYPTO_NAME = /\b(btc|bitcoin|eth|ethereum|solana|crypto|cripto)\b/i
const PENSION_NAME = /\b(plan de pensiones|ppa\b|pias\b|mutualidad|fondo de empleo)\b/i
const NOT_INVEST =
  /\b(moto|coche|furgoneta|garaje|piso|local|hipoteca|préstamo|prestamo)\b/i

const BROKERS: { re: RegExp; name: string }[] = [
  { re: /inbestme/i, name: 'Inbestme' },
  { re: /indexa/i, name: 'Indexa' },
  { re: /finizens/i, name: 'Finizens' },
  { re: /myinvestor/i, name: 'MyInvestor' },
  { re: /renta\s*4/i, name: 'Renta 4' },
  { re: /\bbbva\b/i, name: 'BBVA' },
  { re: /trade\s*republic/i, name: 'Trade Republic' },
  { re: /\bing\b/i, name: 'ING' },
]

function blob(name?: string, ticker?: string, notes?: string): string {
  return [name, ticker, notes].filter(Boolean).join(' ')
}

export function looksLikeInvestment(name?: string, ticker?: string, notes?: string): boolean {
  const text = blob(name, ticker, notes)
  if (!text.trim()) return false
  if (NOT_INVEST.test(text) && !FUND_NAME.test(text)) return false
  if (PENSION_NAME.test(text)) return true
  if (CRYPTO_NAME.test(text)) return true
  if (ticker && ticker.trim()) return true
  if (ISIN_IN_TEXT.test(text.toUpperCase())) return true
  return FUND_NAME.test(text)
}

export function inferInvestment(name?: string, ticker?: string, notes?: string): InferredInvestment {
  const text = blob(name, ticker, notes)
  const upper = text.toUpperCase()

  if (PENSION_NAME.test(text) && !FUND_NAME.test(text)) {
    return { isInvestment: true, category: 'pension', broker: BROKERS.find(b => b.re.test(text))?.name }
  }
  if (CRYPTO_NAME.test(text) && !FUND_NAME.test(text)) {
    const t = ticker?.trim() || (/\bbtc\b|bitcoin/i.test(text) ? 'BTC' : /\beth\b|ethereum/i.test(text) ? 'ETH' : undefined)
    return { isInvestment: true, category: 'crypto', ticker: t }
  }

  if (!looksLikeInvestment(name, ticker, notes)) {
    return { isInvestment: false, category: null }
  }

  const isinMatch = upper.match(ISIN_IN_TEXT)
  const isin = isinMatch ? isinMatch[1] : ticker && isISIN(ticker) ? ticker.trim().toUpperCase() : undefined

  let guessedTicker = ticker?.trim() || undefined
  if (!guessedTicker && !isin) {
    const m = upper.match(TICKER_IN_TEXT)
    if (m && FUND_NAME.test(m[1])) guessedTicker = m[1]
  }

  let assetType: StockKind = 'etf'
  if (/\bacci[oó]n|acciones|stock\b/i.test(text)) assetType = 'accion'
  else if (/fondo activo|gesti[oó]n activa|numantia|bestinver|azvalor|cobas|magallanes/i.test(text))
    assetType = 'fondo_activo'
  else if (/indexado|indexa|vanguard|ishares|msci|vwce|iwda/i.test(text)) assetType = 'fondo_indexado'
  else if (/\betf/i.test(text)) assetType = 'etf'

  let region: InvestRegion = 'world'
  if (/\b(ee\.?uu\.?|usa|us\b|s&p|sp500|nasdaq|dow)\b/i.test(text)) region = 'us'
  else if (/\b(europa|europe|stoxx|eurostoxx)\b/i.test(text)) region = 'europe'
  else if (/\b(emergente|emerging|\bem\b)/i.test(text)) region = 'em'
  else if (/\b(españa|spain|ibex)\b/i.test(text)) region = 'spain'
  else if (/\b(asia|jap[oó]n|nikkei|china)\b/i.test(text)) region = 'asia'
  else if (/\b(global|mundial|all-?world|world|msci world|vwce|iwda)\b/i.test(text)) region = 'world'

  let assetClass: InvestAssetClass = 'equity'
  if (/renta fija|bond|bonos|aggregate|treasury|obligaci/i.test(text)) assetClass = 'bonds'
  else if (/monetario|money market|liquidez/i.test(text)) assetClass = 'money_market'
  else if (/\boro\b|gold|metal/i.test(text)) assetClass = 'commodity'
  else if (/mixto|flexible|patrimonio global|multiactivo/i.test(text)) assetClass = 'mixed'

  return {
    isInvestment: true,
    category: 'stocks',
    assetType,
    region,
    assetClass,
    ticker: guessedTicker,
    isin,
    broker: BROKERS.find(b => b.re.test(text))?.name,
  }
}
