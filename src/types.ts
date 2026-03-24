export type AssetCategory =
  | 'cash'
  | 'stocks'
  | 'crypto'
  | 'real_estate'
  | 'vehicles'
  | 'pension'
  | 'debt'

export interface Asset {
  id: string
  category: AssetCategory
  name: string
  value: number
  symbol?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface WealthSnapshot {
  date: string // ISO date, first of month: "2024-01-01"
  netWorth: number
  liquidAssets: number
}

export interface AppData {
  assets: Asset[]
  monthlyExpenses: number
  lastPriceUpdate?: string
  snapshots?: WealthSnapshot[]
  schema_version: number
}

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  cash: 'Efectivo / cuentas bancarias',
  stocks: 'Acciones, ETFs, fondos',
  crypto: 'Criptomonedas',
  real_estate: 'Inmuebles',
  vehicles: 'Vehículos',
  pension: 'Planes de pensiones',
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
