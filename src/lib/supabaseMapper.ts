import type {
  Asset,
  AssetCategory,
  CashMetadata,
  CommodityMetadata,
  CryptoMetadata,
  DebtMetadata,
  PensionMetadata,
  RealEstateMetadata,
  StocksMetadata,
  VehicleMetadata,
} from '../types'
import { packNotes, unpackNotes } from './fymMeta'
import type {
  AssetInsert,
  AssetRow,
  AssetType,
  LiabilityInsert,
  LiabilityRow,
  LiabilityType,
} from '../types/database'

/** Categories that sync to Supabase. real_estate now syncs (Finca snapshot + manual). */
export const SYNCABLE_CATEGORIES: AssetCategory[] = [
  'cash',
  'stocks',
  'crypto',
  'commodities',
  'pension',
  'vehicles',
  'real_estate',
  'business',
  'receivable',
  'other',
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
 * Map a local Asset to a Supabase assets Insert (excludes debt).
 * Returns null if the category should not be inserted into assets.
 */
export function localAssetToDbInsert(
  asset: Asset,
  userId: string,
  idOverride?: string
): AssetInsert | null {
  if (asset.category === 'debt') return null

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
      const extra = {
        job: meta?.job,
        interestRate: meta?.interestRate,
        parkedReason: meta?.parkedReason,
        availableFrom: meta?.availableFrom,
        lastInterestUpdate: meta?.lastInterestUpdate,
      }
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
        notes: packNotes(asset.notes, extra),
      }
    }
    case 'stocks': {
      const meta = asset.metadata as StocksMetadata | undefined
      const ticker = asset.symbol || meta?.resolvedTicker || null
      const quantity = meta?.quantity && meta.quantity > 0 ? meta.quantity : 1
      return {
        ...base,
        type: mapStockTypeStrict(meta?.assetType),
        ticker,
        ticker_source: ticker ? 'yahoo' : null,
        quantity,
        purchase_price: meta?.purchasePrice ?? null,
        // Last known EUR snapshot. Live tickers still refresh on open; never revert to purchase cost.
        manual_value: asset.value,
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
        manual_value: asset.value,
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
        type: 'vehicle',
        quantity: 1,
        manual_value: asset.value,
        notes: vehicleNote || null,
        is_liquid: false,
        ticker: null,
        ticker_source: null,
        purchase_price: null,
      }
    }
    case 'business':
    case 'receivable':
    case 'other': {
      return {
        ...base,
        type: asset.category,
        quantity: 1,
        manual_value: asset.value,
        is_liquid: false,
        ticker: null,
        ticker_source: null,
        purchase_price: null,
      }
    }
    case 'real_estate': {
      const meta = asset.metadata as RealEstateMetadata | undefined
      const fromFinca = asset.source === 'finca' || Boolean(meta?.fincaId)
      return {
        ...base,
        type: 'real_estate',
        quantity: 1,
        manual_value: asset.value,
        purchase_price: meta?.purchasePrice ?? null,
        is_liquid: false,
        ticker: null,
        ticker_source: null,
        institution: fromFinca ? 'finca' : null,
        country: meta?.municipio ?? null,
        notes: packNotes(asset.notes, {
          source: fromFinca ? 'finca' : 'manual',
          propertyType: meta?.propertyType,
          monthlyRent: meta?.monthlyRent,
          status: meta?.status,
          ownershipPct: meta?.ownershipPct,
          valueSource: meta?.valueSource,
          municipio: meta?.municipio,
          fincaId: meta?.fincaId,
          ttmNetCashflow: meta?.ttmNetCashflow,
        }),
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
      const { human, extra } = unpackNotes(row.notes)
      const cashTypes = ['corriente', 'ahorro', 'remunerada', 'nomina', 'otro'] as const
      const jobs = ['emergency', 'parked', 'working', 'idle'] as const
      const accountType = cashTypes.includes(row.institution as (typeof cashTypes)[number])
        ? (row.institution as CashMetadata['accountType'])
        : undefined
      const job = jobs.includes(extra.job as (typeof jobs)[number])
        ? (extra.job as CashMetadata['job'])
        : undefined
      return {
        id: row.id,
        category: 'cash',
        name: row.name,
        value,
        notes: human,
        metadata: {
          ...(accountType ? { accountType } : {}),
          ...(job ? { job } : {}),
          ...(typeof extra.interestRate === 'number' ? { interestRate: extra.interestRate } : {}),
          ...(typeof extra.parkedReason === 'string' ? { parkedReason: extra.parkedReason } : {}),
          ...(typeof extra.availableFrom === 'string' ? { availableFrom: extra.availableFrom } : {}),
          ...(typeof extra.lastInterestUpdate === 'string'
            ? { lastInterestUpdate: extra.lastInterestUpdate }
            : {}),
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
    case 'real_estate': {
      const { human, extra } = unpackNotes(row.notes)
      const fromFinca = row.institution === 'finca' || extra.source === 'finca'
      return {
        id: row.id,
        category: 'real_estate',
        name: row.name,
        value,
        notes: human,
        metadata: {
          propertyType: (extra.propertyType as RealEstateMetadata['propertyType']) || 'alquiler',
          monthlyRent: typeof extra.monthlyRent === 'number' ? extra.monthlyRent : undefined,
          purchasePrice: row.purchase_price ?? undefined,
          status: typeof extra.status === 'string' ? extra.status : undefined,
          ownershipPct: typeof extra.ownershipPct === 'number' ? extra.ownershipPct : undefined,
          valueSource: extra.valueSource === 'mercado' || extra.valueSource === 'catastro' ? extra.valueSource : undefined,
          municipio: (typeof extra.municipio === 'string' ? extra.municipio : row.country) ?? undefined,
          fincaId: typeof extra.fincaId === 'string' ? extra.fincaId : fromFinca ? row.id : undefined,
          ttmNetCashflow: typeof extra.ttmNetCashflow === 'number' ? extra.ttmNetCashflow : undefined,
        } satisfies RealEstateMetadata,
        source: fromFinca ? 'finca' : 'manual',
        readOnly: fromFinca,
        createdAt: created,
        updatedAt: now,
      }
    }
    case 'business':
      return {
        id: row.id,
        category: 'business',
        name: row.name,
        value,
        notes: row.notes ?? undefined,
        createdAt: created,
        updatedAt: now,
      }
    case 'receivable':
      return {
        id: row.id,
        category: 'receivable',
        name: row.name,
        value,
        notes: row.notes ?? undefined,
        createdAt: created,
        updatedAt: now,
      }
    case 'vehicle':
    case 'other':
    default: {
      const vehicleTypeMatch = row.notes?.match(/tipo:(\w+)/)
      const yearMatch = row.notes?.match(/año:(\d+)/)
      const isVehicle = row.type === 'vehicle' || Boolean(vehicleTypeMatch)
      const cleanedNotes = row.notes
        ?.replace(/\s*\|\s*tipo:\w+/g, '')
        .replace(/\s*\|\s*año:\d+/g, '')
        .replace(/tipo:\w+/g, '')
        .replace(/año:\d+/g, '')
        .trim()
      if (!isVehicle) {
        return {
          id: row.id,
          category: 'other',
          name: row.name,
          value,
          notes: row.notes ?? undefined,
          createdAt: created,
          updatedAt: now,
        }
      }
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
 * Manual real_estate now syncs. Finca-sourced rows are omitted here (the
 * sync-finca endpoint upserts them with stable Finca UUIDs).
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
    if (asset.source === 'finca' || asset.readOnly) {
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

function isFincaAsset(asset: Asset): boolean {
  return asset.source === 'finca' || Boolean(asset.readOnly)
}

function stamp(asset: Asset): number {
  return Date.parse(asset.updatedAt || asset.createdAt || '') || 0
}

/**
 * Merge cloud + local without dropping unsynced edits.
 * Finca rows always come from cloud. Other local-only or newer local rows win
 * and are returned in `toUpsert` so they can be pushed up.
 */
export function mergeCloudAndLocal(
  cloudAssets: Asset[],
  localAssets: Asset[]
): { merged: Asset[]; toUpsert: Asset[] } {
  const merged = new Map<string, Asset>()
  const toUpsert: Asset[] = []

  for (const row of cloudAssets) merged.set(row.id, row)

  const hasFincaCloud = cloudAssets.some(isFincaAsset)
  const fincaNames = new Set(cloudAssets.filter(isFincaAsset).map(a => a.name))

  for (const local of localAssets) {
    if (isFincaAsset(local)) continue
    // Inmuebles los trae Finca. No reinyectar pisos locales sueltos.
    if (local.category === 'real_estate' && hasFincaCloud && !merged.has(local.id)) continue
    if (local.category === 'real_estate' && fincaNames.has(local.name)) continue

    const cloud = merged.get(local.id)
    if (!cloud) {
      merged.set(local.id, local)
      toUpsert.push(local)
      continue
    }
    if (isFincaAsset(cloud)) continue
    if (stamp(local) > stamp(cloud)) {
      merged.set(local.id, local)
      toUpsert.push(local)
    }
  }

  return { merged: [...merged.values()], toUpsert }
}

/** @deprecated use mergeCloudAndLocal */
export function mergeCloudWithLocalRealEstate(
  cloudAssets: Asset[],
  localAssets: Asset[]
): Asset[] {
  return mergeCloudAndLocal(cloudAssets, localAssets).merged
}
