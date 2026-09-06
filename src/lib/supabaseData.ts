import type { Asset } from '../types'
import { supabase } from './supabase'
import {
  dbAssetToLocal,
  dbLiabilityToLocal,
  localAssetToDbInsert,
  localDebtToLiabilityInsert,
  mergeCloudWithLocalRealEstate,
  prepareMigrationPayload,
} from './supabaseMapper'
import type { ProfileRow } from '../types/database'

export const MIGRATION_FLAG_KEY = 'fym_migrated_to_supabase'

/** Light idempotent upsert — trigger already creates profile on signup. */
export async function ensureProfile(userId: string, email?: string | null): Promise<ProfileRow | null> {
  if (!supabase) return null

  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (selectError) {
    console.warn('ensureProfile select failed', selectError.message)
  }
  if (existing) return existing

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: email ?? null,
        display_currency: 'EUR',
      },
      { onConflict: 'id' }
    )
    .select()
    .maybeSingle()

  if (error) {
    console.warn('ensureProfile upsert failed', error.message)
    return null
  }
  return data
}

export async function listCloudAssets(userId: string): Promise<Asset[]> {
  if (!supabase) return []

  const [assetsRes, liabilitiesRes] = await Promise.all([
    supabase.from('assets').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('liabilities').select('*').eq('user_id', userId).order('created_at'),
  ])

  if (assetsRes.error) throw assetsRes.error
  if (liabilitiesRes.error) throw liabilitiesRes.error

  const fromAssets = (assetsRes.data ?? []).map(dbAssetToLocal)
  const fromLiabilities = (liabilitiesRes.data ?? []).map(dbLiabilityToLocal)
  return [...fromAssets, ...fromLiabilities]
}

export async function countUserCloudRows(userId: string): Promise<number> {
  if (!supabase) return 0

  const [a, l] = await Promise.all([
    supabase.from('assets').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase
      .from('liabilities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  return (a.count ?? 0) + (l.count ?? 0)
}

export function hasMigrationFlag(): boolean {
  try {
    return localStorage.getItem(MIGRATION_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function setMigrationFlag(): void {
  try {
    localStorage.setItem(MIGRATION_FLAG_KEY, '1')
  } catch {
    // ignore
  }
}

/**
 * One-shot local → Supabase migration.
 * Skips if flag set or cloud already has rows. Omits real_estate.
 * Idempotent: safe to call repeatedly.
 */
export async function migrateLocalToSupabaseIfNeeded(
  localAssets: Asset[],
  userId: string
): Promise<{ migrated: boolean; omittedRealEstate: Asset[]; cloudAssets: Asset[] }> {
  if (!supabase) {
    return { migrated: false, omittedRealEstate: [], cloudAssets: [] }
  }

  if (hasMigrationFlag()) {
    const cloudAssets = await listCloudAssets(userId)
    return { migrated: false, omittedRealEstate: [], cloudAssets }
  }

  const cloudCount = await countUserCloudRows(userId)
  if (cloudCount > 0) {
    setMigrationFlag()
    const cloudAssets = await listCloudAssets(userId)
    return { migrated: false, omittedRealEstate: [], cloudAssets }
  }

  const syncable = localAssets.filter(a => a.category !== 'real_estate')
  if (syncable.length === 0) {
    setMigrationFlag()
    return {
      migrated: false,
      omittedRealEstate: localAssets.filter(a => a.category === 'real_estate'),
      cloudAssets: [],
    }
  }

  const { assetInserts, liabilityInserts, omittedRealEstate } = prepareMigrationPayload(
    localAssets,
    userId
  )

  if (assetInserts.length > 0) {
    const { error } = await supabase.from('assets').insert(assetInserts)
    if (error) throw error
  }
  if (liabilityInserts.length > 0) {
    const { error } = await supabase.from('liabilities').insert(liabilityInserts)
    if (error) throw error
  }

  setMigrationFlag()
  const cloudAssets = await listCloudAssets(userId)
  return { migrated: true, omittedRealEstate, cloudAssets }
}

export async function createCloudAsset(asset: Asset, userId: string): Promise<Asset> {
  if (!supabase) throw new Error('Supabase no configurado')

  if (asset.category === 'real_estate') {
    return asset // local-only — not persisted to cloud
  }

  if (asset.category === 'debt') {
    const row = localDebtToLiabilityInsert(asset, userId)
    if (!row) throw new Error('No se pudo mapear la deuda')
    const { data, error } = await supabase.from('liabilities').insert(row).select().single()
    if (error) throw error
    return dbLiabilityToLocal(data)
  }

  const row = localAssetToDbInsert(asset, userId)
  if (!row) throw new Error('Categoría no sincronizable')
  const { data, error } = await supabase.from('assets').insert(row).select().single()
  if (error) throw error
  return dbAssetToLocal(data)
}

export async function updateCloudAsset(asset: Asset, userId: string): Promise<Asset> {
  if (!supabase) throw new Error('Supabase no configurado')

  if (asset.category === 'real_estate') {
    return asset
  }

  if (asset.category === 'debt') {
    const row = localDebtToLiabilityInsert(asset, userId)
    if (!row) throw new Error('No se pudo mapear la deuda')
    const update = {
      name: row.name,
      type: row.type,
      balance: row.balance,
      interest_rate: row.interest_rate,
      monthly_payment: row.monthly_payment,
      end_date: row.end_date,
      currency: row.currency,
      notes: row.notes,
      is_current: row.is_current,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('liabilities')
      .update(update)
      .eq('id', asset.id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    return dbLiabilityToLocal(data)
  }

  const row = localAssetToDbInsert(asset, userId, asset.id)
  if (!row) throw new Error('Categoría no sincronizable')
  const update = {
    name: row.name,
    type: row.type,
    ticker: row.ticker,
    ticker_source: row.ticker_source,
    quantity: row.quantity,
    purchase_price: row.purchase_price,
    manual_value: row.manual_value,
    currency: row.currency,
    institution: row.institution ?? null,
    notes: row.notes,
    is_liquid: row.is_liquid,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('assets')
    .update(update)
    .eq('id', asset.id)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw error
  return dbAssetToLocal(data)
}

export async function deleteCloudAsset(
  asset: Asset,
  userId: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase no configurado')
  if (asset.category === 'real_estate') return

  if (asset.category === 'debt') {
    const { error } = await supabase
      .from('liabilities')
      .delete()
      .eq('id', asset.id)
      .eq('user_id', userId)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('id', asset.id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function getProfileMonthlyExpenses(userId: string): Promise<number | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('monthly_expenses')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.warn('getProfileMonthlyExpenses failed', error.message)
    return null
  }
  if (data?.monthly_expenses == null) return null
  return Number(data.monthly_expenses)
}

export async function saveProfileMonthlyExpenses(userId: string, monthlyExpenses: number): Promise<void> {
  if (!supabase) throw new Error('Supabase no configurado')
  const { error } = await supabase
    .from('profiles')
    .update({ monthly_expenses: monthlyExpenses })
    .eq('id', userId)
  if (error) throw error
}

export { mergeCloudWithLocalRealEstate }
