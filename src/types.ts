export type AssetCategory =
  | 'cash'
  | 'stocks'
  | 'crypto'
  | 'real_estate'
  | 'vehicles'
  | 'pension'
  | 'debt'

// Per-category metadata — all fields optional for backwards compatibility
export interface CashMetadata {
  accountType?: 'corriente' | 'ahorro' | 'remunerada' | 'nomina' | 'otro'
  interestRate?: number // annual % for remunerada accounts
}

export interface StocksMetadata {
  assetType?: 'accion' | 'etf' | 'fondo_indexado' | 'fondo_activo' | 'otro'
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

export type AssetMetadata =
  | CashMetadata
  | StocksMetadata
  | CryptoMetadata
  | RealEstateMetadata
  | VehicleMetadata
  | PensionMetadata
  | DebtMetadata

export interface Asset {
  id: string
  category: AssetCategory
  name: string
  value: number            // ALWAYS total EUR value
  symbol?: string          // ticker for auto price updates (stocks/crypto)
  notes?: string
  metadata?: AssetMetadata
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
  schema_version: number
}

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  cash: 'Efectivo / cuentas',
  stocks: 'Acciones, ETFs, fondos',
  crypto: 'Criptomonedas',
  real_estate: 'Inmuebles',
  vehicles: 'Vehículos',
  pension: 'Pensiones y PIAS',
  debt: 'Deudas',
}

export const CATEGORY_ORDER: AssetCategory[] = [
  'cash',
  'stocks',
  'crypto',
  'real_estate',
  'vehicles',
  'pension',
  'debt',
]

export const LIQUID_CATEGORIES: AssetCategory[] = ['cash', 'stocks', 'crypto']
