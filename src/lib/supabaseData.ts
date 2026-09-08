import type { Asset } from '../types'
import { supabase } from './supabase'
import {
  dbAssetToLocal,
  dbLiabilityToLocal,
  isUuid,
  localAssetToDbInsert,
  localDebtToLiabilityInsert,
  mergeCloudAndLocal,
  mergeCloudWithLocalRealEstate,
  prepareMigrationPayload,
} from './supabaseMapper'
import type { Database, ProfileRow } from '../types/database'

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
 * Skips if flag set or cloud already has rows.
 * Finca-sourced real_estate is omitted (sync-finca upserts those).
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

  const syncable = localAssets.filter(a => a.source !== 'finca' && !a.readOnly)
  if (syncable.length === 0) {
    setMigrationFlag()
    return {
      migrated: false,
      omittedRealEstate: localAssets.filter(a => a.source === 'finca' || a.readOnly),
      cloudAssets: [],
    }
  }

  const { assetInserts, liabilityInserts, omittedRealEstate } = prepareMigrationPayload(
    localAssets,
    userId
  )

  // Atomic: if liabilities fail after assets insert, roll back those asset rows
  // and do NOT set the migration flag (no half-state).
  let insertedAssetIds: string[] = []
  if (assetInserts.length > 0) {
    const { data, error } = await supabase.from('assets').insert(assetInserts).select('id')
    if (error) throw error
    insertedAssetIds = (data ?? []).map(row => row.id)
  }
  if (liabilityInserts.length > 0) {
    const { error } = await supabase.from('liabilities').insert(liabilityInserts)
    if (error) {
      if (insertedAssetIds.length > 0) {
        const { error: cleanupError } = await supabase
          .from('assets')
          .delete()
          .in('id', insertedAssetIds)
          .eq('user_id', userId)
        if (cleanupError) {
          console.warn(
            'migrateLocalToSupabaseIfNeeded: failed to roll back assets after liability insert error',
            cleanupError.message
          )
        }
      }
      // Do not set migration flag — leave local data intact for retry
      throw error
    }
  }

  setMigrationFlag()
  const cloudAssets = await listCloudAssets(userId)
  return { migrated: true, omittedRealEstate, cloudAssets }
}

export async function createCloudAsset(asset: Asset, userId: string): Promise<Asset> {
  if (!supabase) throw new Error('Supabase no configurado')

  if (asset.readOnly || asset.source === 'finca') {
    return asset
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

  if (asset.readOnly || asset.source === 'finca') {
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
  if (asset.readOnly || asset.source === 'finca') return

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


export interface ProfileSettings {
  monthlyExpenses: number | null
  emergencyTargetMonths: number | null
}

export async function getProfileMonthlyExpenses(userId: string): Promise<number | null> {
  const s = await getProfileSettings(userId)
  return s.monthlyExpenses
}

export async function getProfileSettings(userId: string): Promise<ProfileSettings> {
  if (!supabase) return { monthlyExpenses: null, emergencyTargetMonths: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('monthly_expenses, emergency_target_months')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.warn('getProfileSettings failed', error.message)
    return { monthlyExpenses: null, emergencyTargetMonths: null }
  }
  const row = data as { monthly_expenses?: number | null; emergency_target_months?: number | null } | null
  return {
    monthlyExpenses: row?.monthly_expenses != null ? Number(row.monthly_expenses) : null,
    emergencyTargetMonths:
      row?.emergency_target_months != null ? Number(row.emergency_target_months) : null,
  }
}

export async function saveProfileMonthlyExpenses(userId: string, monthlyExpenses: number): Promise<void> {
  await saveProfileSettings(userId, { monthlyExpenses })
}

export async function saveProfileSettings(
  userId: string,
  settings: { monthlyExpenses?: number; emergencyTargetMonths?: number }
): Promise<void> {
  if (!supabase) throw new Error('Supabase no configurado')
  const patch: Database['public']['Tables']['profiles']['Update'] = {}
  if (settings.monthlyExpenses != null) patch.monthly_expenses = settings.monthlyExpenses
  if (settings.emergencyTargetMonths != null) patch.emergency_target_months = settings.emergencyTargetMonths
  if (patch.monthly_expenses == null && patch.emergency_target_months == null) return
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw error
}

/**
 * Push local-only or newer local rows to the cloud. Non-UUID ids get a new uuid on insert.
 */
export async function pushLocalAssetsToCloud(
  assets: Asset[],
  userId: string
): Promise<Asset[]> {
  const out: Asset[] = []
  for (const asset of assets) {
    if (asset.readOnly || asset.source === 'finca') {
      out.push(asset)
      continue
    }
    try {
      if (isUuid(asset.id)) {
        try {
          out.push(await updateCloudAsset(asset, userId))
          continue
        } catch {
          out.push(await createCloudAsset(asset, userId))
          continue
        }
      }
      const created = await createCloudAsset(
        { ...asset, id: crypto.randomUUID() },
        userId
      )
      out.push(created)
    } catch {
      out.push(asset)
    }
  }
  return out
}

export { mergeCloudAndLocal, mergeCloudWithLocalRealEstate }
