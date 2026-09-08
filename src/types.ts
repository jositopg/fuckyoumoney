export type AssetCategory =
  | 'cash'
  | 'stocks'
  | 'crypto'
  | 'real_estate'
  | 'vehicles'
  | 'pension'
  | 'debt'
  | 'commodities'
  | 'business'
  | 'receivable'
  | 'other'

// Per-category metadata — all fields optional for backwards compatibility
export interface CashMetadata {
  accountType?: 'corriente' | 'ahorro' | 'remunerada' | 'nomina' | 'otro'
  interestRate?: number    // annual % for remunerada/ahorro accounts
  lastInterestUpdate?: string // ISO date — last time compound interest was applied
}

export interface StocksMetadata {
  assetType?: 'accion' | 'etf' | 'fondo_indexado' | 'fondo_activo' | 'otro'
  identifierType?: 'ticker' | 'isin'   // how the user identified this asset
  resolvedTicker?: string              // ticker cached after ISIN resolution (avoids repeated OpenFIGI calls)
  canAutoUpdate?: boolean              // false for unlisted funds (no exchange price)
  quantity?: number        // number of shares/units
  pricePerUnit?: number    // current price per unit in EUR (auto-updated)
  purchasePrice?: number   // average purchase price per unit (for P&L)
}

export interface CryptoMetadata {
  quantity?: number        // amount in crypto units (e.g. 0.5 BTC)
  pricePerUnit?: number    // current price in EUR (auto-updated)
  purchasePrice?: number   // purchase price per unit (for P&L)
  wallet?: string          // Binance, Coinbase, Ledger, etc.
}

export interface RealEstateMetadata {
  propertyType?: 'vivienda_habitual' | 'alquiler' | 'local' | 'garaje' | 'terreno' | 'otro'
  purchasePrice?: number   // historical purchase price
  monthlyRent?: number     // monthly rental income (if rented)
  status?: string          // finca estado
  ownershipPct?: number
  valueSource?: 'mercado' | 'catastro'
  municipio?: string
  fincaId?: string
  ttmNetCashflow?: number
}

export interface VehicleMetadata {
  vehicleType?: 'coche' | 'moto' | 'furgoneta' | 'otro'
  year?: number            // year of registration
}

export interface PensionMetadata {
  pensionType?: 'plan_pensiones' | 'pias' | 'ppa' | 'fondo_empleo' | 'otro'
  manager?: string         // Indexa, Finizens, Bestinver, etc.
  monthlyContribution?: number
}

export interface DebtMetadata {
  debtType?: 'hipoteca' | 'prestamo_personal' | 'prestamo_coche' | 'tarjeta' | 'estudiante' | 'otro'
  interestRate?: number    // annual % (TIN)
  monthlyPayment?: number  // monthly installment in EUR
  dueDate?: string         // estimated end date YYYY-MM-DD
}

export interface CommodityMetadata {
  commodityType?: 'oro' | 'plata' | 'platino' | 'paladio' | 'otro'
  unit?: 'g' | 'oz' | 'kg'  // oz = troy oz
  quantity?: number          // amount in grams, troy oz, or kg
  pricePerUnit?: number      // current price in EUR per unit (auto-updated)
  purchasePrice?: number     // purchase price per unit in EUR (for P&L)
}

export interface BusinessMetadata {
  ownershipPct?: number
}

export interface ReceivableMetadata {
  counterparty?: string
}

export type AssetMetadata =
  | CashMetadata
  | StocksMetadata
  | CryptoMetadata
  | RealEstateMetadata
  | VehicleMetadata
  | PensionMetadata
  | DebtMetadata
  | CommodityMetadata
  | BusinessMetadata
  | ReceivableMetadata

export type AssetSource = 'manual' | 'finca' | 'market'

export interface Asset {
  id: string
  category: AssetCategory
  name: string
  value: number            // ALWAYS total EUR value
  symbol?: string          // ticker for auto price updates (stocks/crypto)
  notes?: string
  metadata?: AssetMetadata
  source?: AssetSource
  readOnly?: boolean
  createdAt: string
  updatedAt: string
}

export interface WealthSnapshot {
  date: string
  netWorth: number
  liquidAssets: number
}

export interface AppData {
  assets: Asset[]
  monthlyExpenses: number
  lastPriceUpdate?: string
  snapshots?: WealthSnapshot[]
  lastExportReminder?: string // ISO date — last time we showed the export reminder
  hasSeenOnboarding?: boolean
  schema_version: number
}

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  cash: 'Cuentas',
  stocks: 'Fondos y acciones',
  crypto: 'Cripto',
  commodities: 'Metales',
  real_estate: 'Inmuebles',
  vehicles: 'Vehículos',
  pension: 'Pensiones',
  business: 'Negocios',
  receivable: 'Me deben',
  other: 'Otros',
  debt: 'Deudas',
}

export const CATEGORY_ORDER: AssetCategory[] = [
  'cash',
  'stocks',
  'crypto',
  'real_estate',
  'pension',
  'commodities',
  'vehicles',
  'business',
  'receivable',
  'other',
  'debt',
]

export const POSITION_GROUPS: { id: string; label: string; categories: AssetCategory[] }[] = [
  { id: 'liquid', label: 'Liquidez', categories: ['cash'] },
  { id: 'invest', label: 'Inversiones', categories: ['stocks', 'crypto'] },
  { id: 'real_estate', label: 'Inmuebles', categories: ['real_estate'] },
  {
    id: 'other',
    label: 'Otros',
    categories: ['pension', 'commodities', 'vehicles', 'business', 'receivable', 'other'],
  },
  { id: 'debt', label: 'Deudas', categories: ['debt'] },
]

export const LIQUID_CATEGORIES: AssetCategory[] = ['cash', 'stocks', 'crypto']
