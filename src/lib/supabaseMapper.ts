import type {
  Asset,
  AssetCategory,
  CashMetadata,
  CommodityMetadata,
  CryptoMetadata,
  DebtMetadata,
  PensionMetadata,
  StocksMetadata,
  VehicleMetadata,
} from '../types'
import type {
  AssetInsert,
  AssetRow,
  AssetType,
  LiabilityInsert,
  LiabilityRow,
  LiabilityType,
} from '../types/database'

/** Categories that sync to Supabase. real_estate is omitted (local-only, no cloud CRUD). */
export const SYNCABLE_CATEGORIES: AssetCategory[] = [
  'cash',
  'stocks',
  'crypto',
  'commodities',
  'pension',
  'vehicles',
  'debt',
]

export function isSyncableCategory(category: AssetCategory): boolean {
  return SYNCABLE_CATEGORIES.includes(category)
}

export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  )
}

function mapStockTypeStrict(assetType?: StocksMetadata['assetType']): AssetType {
  if (assetType === 'accion') return 'stock'
  if (assetType === 'etf' || assetType === 'fondo_indexado') return 'etf'
  if (assetType === 'fondo_activo') return 'other'
  return 'other'
}

export function mapDebtType(debtType?: DebtMetadata['debtType']): LiabilityType {
  switch (debtType) {
    case 'hipoteca':
      return 'mortgage'
    case 'prestamo_personal':
      return 'personal_loan'
    case 'prestamo_coche':
      return 'car_loan'
    case 'tarjeta':
      return 'credit_card'
    case 'estudiante':
      return 'student_loan'
    case 'otro':
    default:
      return 'other'
  }
}

export function reverseDebtType(type: LiabilityType): DebtMetadata['debtType'] {
  switch (type) {
    case 'mortgage':
      return 'hipoteca'
    case 'personal_loan':
      return 'prestamo_personal'
    case 'car_loan':
      return 'prestamo_coche'
    case 'credit_card':
      return 'tarjeta'
    case 'student_loan':
      return 'estudiante'
    case 'other':
    default:
      return 'otro'
  }
}

function reverseStockType(type: AssetType): StocksMetadata['assetType'] {
  if (type === 'stock') return 'accion'
  if (type === 'etf') return 'etf'
  return 'otro'
}

/**
 * Map a local Asset to a Supabase assets Insert (excludes debt & real_estate).
 * Returns null if the category should not be inserted into assets.
 */
export function localAssetToDbInsert(
  asset: Asset,
  userId: string,
  idOverride?: string
): AssetInsert | null {
  if (asset.category === 'debt' || asset.category === 'real_estate') return null

  const id = idOverride ?? (isUuid(asset.id) ? asset.id : crypto.randomUUID())
  const base = {
    id,
    user_id: userId,
    name: asset.name,
    currency: 'EUR',
    notes: asset.notes ?? null,
    updated_at: asset.updatedAt || new Date().toISOString(),
    created_at: asset.createdAt || new Date().toISOString(),
  }

  switch (asset.category) {
    case 'cash': {
      const meta = asset.metadata as CashMetadata | undefined
      // Bank/label stays in asset.name; accountType maps to institution for MVP cash-por-banco
      return {
        ...base,
        type: 'cash',
        quantity: 1,
        manual_value: asset.value,
        is_liquid: true,
        ticker: null,
        ticker_source: null,
        purchase_price: null,
        institution: meta?.accountType ?? null,
      }
    }
    case 'stocks': {
      const meta = asset.metadata as StocksMetadata | undefined
      const ticker = asset.symbol || meta?.resolvedTicker || null
      const hasLiveTicker = Boolean(ticker) && meta?.canAutoUpdate !== false
      const quantity = meta?.quantity && meta.quantity > 0 ? meta.quantity : 1
      return {
        ...base,
        type: mapStockTypeStrict(meta?.assetType),
        ticker,
        ticker_source: ticker ? 'yahoo' : null,
        quantity,
        purchase_price: meta?.purchasePrice ?? null,
        manual_value: hasLiveTicker ? null : asset.value,
        is_liquid: true,
      }
    }
    case 'crypto': {
      const meta = asset.metadata as CryptoMetadata | undefined
      const ticker = asset.symbol || null
      const quantity = meta?.quantity && meta.quantity > 0 ? meta.quantity : 1
      return {
        ...base,
        type: 'crypto',
        ticker,
        ticker_source: ticker ? 'coingecko' : null,
        quantity,
        purchase_price: meta?.purchasePrice ?? null,
        manual_value: ticker ? null : asset.value,
        is_liquid: true,
        institution: meta?.wallet ?? null,
      }
    }
    case 'commodities': {
      const meta = asset.metadata as CommodityMetadata | undefined
      const quantity = meta?.quantity && meta.quantity > 0 ? meta.quantity : 1
      const ticker = asset.symbol || null
      return {
        ...base,
        type: 'commodity',
        ticker,
        ticker_source: null,
        quantity,
        purchase_price: meta?.purchasePrice ?? null,
        manual_value: ticker || meta?.quantity ? null : asset.value,
        is_liquid: false,
        notes: asset.notes ?? (meta?.commodityType ? `commodity:${meta.commodityType}` : null),
      }
    }
    case 'pension': {
      const meta = asset.metadata as PensionMetadata | undefined
      return {
        ...base,
        type: 'pension',
        quantity: 1,
        manual_value: asset.value,
        institution: meta?.manager ?? null,
        is_liquid: false,
        ticker: null,
        ticker_source: null,
        purchase_price: null,
      }
    }
    case 'vehicles': {
      const meta = asset.metadata as VehicleMetadata | undefined
      const vehicleNote = [
        asset.notes,
        meta?.vehicleType ? `tipo:${meta.vehicleType}` : null,
        meta?.year ? `año:${meta.year}` : null,
      ]
        .filter(Boolean)
        .join(' | ')
      return {
        ...base,
        type: 'other',
        quantity: 1,
        manual_value: asset.value,
        notes: vehicleNote || null,
        is_liquid: false,
        ticker: null,
        ticker_source: null,
        purchase_price: null,
      }
    }
    default:
      return null
  }
}

/**
 * Map a local debt Asset to a liabilities Insert.
 */
export function localDebtToLiabilityInsert(
  asset: Asset,
  userId: string,
  idOverride?: string
): LiabilityInsert | null {
  if (asset.category !== 'debt') return null
  const meta = asset.metadata as DebtMetadata | undefined
  const id = idOverride ?? (isUuid(asset.id) ? asset.id : crypto.randomUUID())
  return {
    id,
    user_id: userId,
    name: asset.name,
    type: mapDebtType(meta?.debtType),
    balance: Math.max(0, asset.value),
    interest_rate: meta?.interestRate ?? null,
    monthly_payment: meta?.monthlyPayment ?? null,
    end_date: meta?.dueDate ?? null,
    currency: 'EUR',
    notes: asset.notes ?? null,
    is_current: true,
    created_at: asset.createdAt || new Date().toISOString(),
    updated_at: asset.updatedAt || new Date().toISOString(),
  }
}

function computeValue(row: AssetRow): number {
  if (row.manual_value != null && row.manual_value > 0) return row.manual_value
  if (row.purchase_price != null && row.quantity > 0) {
    return row.quantity * row.purchase_price
  }
  return row.manual_value ?? 0
}

/**
 * Convert a DB asset row back to the local Asset model for the UI.
 */
export function dbAssetToLocal(row: AssetRow): Asset {
  const value = computeValue(row)
  const now = row.updated_at || new Date().toISOString()
  const created = row.created_at || now

  switch (row.type) {
    case 'cash': {
      const cashTypes = ['corriente', 'ahorro', 'remunerada', 'nomina', 'otro'] as const
      const accountType = cashTypes.includes(row.institution as (typeof cashTypes)[number])
        ? (row.institution as CashMetadata['accountType'])
        : undefined
      return {
        id: row.id,
        category: 'cash',
        name: row.name,
        value,
        notes: row.notes ?? undefined,
        metadata: {
          ...(accountType ? { accountType } : {}),
        } satisfies CashMetadata,
        createdAt: created,
        updatedAt: now,
      }
    }
    case 'stock':
    case 'etf':
    case 'bond':
      return {
        id: row.id,
        category: 'stocks',
        name: row.name,
        value,
        symbol: row.ticker ?? undefined,
        notes: row.notes ?? undefined,
        metadata: {
          assetType: reverseStockType(row.type),
          quantity: row.quantity,
          purchasePrice: row.purchase_price ?? undefined,
          pricePerUnit:
            row.quantity > 0 && value > 0 ? value / row.quantity : undefined,
          canAutoUpdate: Boolean(row.ticker),
          resolvedTicker: row.ticker ?? undefined,
        } satisfies StocksMetadata,
        createdAt: created,
        updatedAt: now,
      }
    case 'crypto':
      return {
        id: row.id,
        category: 'crypto',
        name: row.name,
        value,
        symbol: row.ticker ?? undefined,
        notes: row.notes ?? undefined,
        metadata: {
          quantity: row.quantity,
          purchasePrice: row.purchase_price ?? undefined,
          pricePerUnit:
            row.quantity > 0 && value > 0 ? value / row.quantity : undefined,
          wallet: row.institution ?? undefined,
        } satisfies CryptoMetadata,
        createdAt: created,
        updatedAt: now,
      }
    case 'commodity': {
      const commodityMatch = row.notes?.match(/commodity:(\w+)/)
      return {
        id: row.id,
        category: 'commodities',
        name: row.name,
        value,
        symbol: row.ticker ?? undefined,
        notes: row.notes?.replace(/\s*commodity:\w+/, '').trim() || undefined,
        metadata: {
          commodityType: (commodityMatch?.[1] as CommodityMetadata['commodityType']) || 'otro',
          quantity: row.quantity,
          purchasePrice: row.purchase_price ?? undefined,
          pricePerUnit:
            row.quantity > 0 && value > 0 ? value / row.quantity : undefined,
        } satisfies CommodityMetadata,
        createdAt: created,
        updatedAt: now,
      }
    }
    case 'pension':
      return {
        id: row.id,
        category: 'pension',
        name: row.name,
        value,
        notes: row.notes ?? undefined,
        metadata: {
          manager: row.institution ?? undefined,
        } satisfies PensionMetadata,
        createdAt: created,
        updatedAt: now,
      }
    case 'other':
    case 'real_estate':
    default: {
      // Vehicles (and misc) map to type=other
      const vehicleTypeMatch = row.notes?.match(/tipo:(\w+)/)
      const yearMatch = row.notes?.match(/año:(\d+)/)
      const cleanedNotes = row.notes
        ?.replace(/\s*\|\s*tipo:\w+/g, '')
        .replace(/\s*\|\s*año:\d+/g, '')
        .replace(/tipo:\w+/g, '')
        .replace(/año:\d+/g, '')
        .trim()
      return {
        id: row.id,
        category: 'vehicles',
        name: row.name,
        value,
        notes: cleanedNotes || undefined,
        metadata: {
          vehicleType: (vehicleTypeMatch?.[1] as VehicleMetadata['vehicleType']) || undefined,
          year: yearMatch ? Number(yearMatch[1]) : undefined,
        } satisfies VehicleMetadata,
        createdAt: created,
        updatedAt: now,
      }
    }
  }
}

/**
 * Convert a DB liability row to a local debt Asset.
 */
export function dbLiabilityToLocal(row: LiabilityRow): Asset {
  return {
    id: row.id,
    category: 'debt',
    name: row.name,
    value: row.balance,
    notes: row.notes ?? undefined,
    metadata: {
      debtType: reverseDebtType(row.type),
      interestRate: row.interest_rate ?? undefined,
      monthlyPayment: row.monthly_payment ?? undefined,
      dueDate: row.end_date ?? undefined,
    } satisfies DebtMetadata,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  }
}

/**
 * Split local assets into rows ready for migration inserts.
 * Omits real_estate. Returns assets inserts + liability inserts + id map (localId → newUuid).
 */
export function prepareMigrationPayload(
  assets: Asset[],
  userId: string
): {
  assetInserts: AssetInsert[]
  liabilityInserts: LiabilityInsert[]
  idMap: Record<string, string>
  omittedRealEstate: Asset[]
} {
  const assetInserts: AssetInsert[] = []
  const liabilityInserts: LiabilityInsert[] = []
  const idMap: Record<string, string> = {}
  const omittedRealEstate: Asset[] = []

  for (const asset of assets) {
    if (asset.category === 'real_estate') {
      omittedRealEstate.push(asset)
      continue
    }

    const newId = isUuid(asset.id) ? asset.id : crypto.randomUUID()
    idMap[asset.id] = newId

    if (asset.category === 'debt') {
      const row = localDebtToLiabilityInsert(asset, userId, newId)
      if (row) liabilityInserts.push(row)
    } else {
      const row = localAssetToDbInsert(asset, userId, newId)
      if (row) assetInserts.push(row)
    }
  }

  return { assetInserts, liabilityInserts, idMap, omittedRealEstate }
}

/** Merge cloud-mapped assets with local-only real_estate slice. */
export function mergeCloudWithLocalRealEstate(
  cloudAssets: Asset[],
  localAssets: Asset[]
): Asset[] {
  const localOnly = localAssets.filter(a => a.category === 'real_estate')
  return [...cloudAssets, ...localOnly]
}
