import type { Asset } from '../types'
import { fechaMadrid } from '../../lib/evolucion.js'
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
import type { AssetInsert, Database, LiabilityInsert, ProfileRow } from '../types/database'

export class CloudConflictError extends Error {
  readonly current: Asset

  constructor(current: Asset) {
    super('Esa ficha cambió en otro sitio. Se ha recargado el valor de la nube.')
    this.name = 'CloudConflictError'
    this.current = current
  }
}

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

export function formatCloudError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string }
    const parts = [e.message, e.details, e.hint].filter(p => typeof p === 'string' && p.trim())
    if (parts.length) return parts.join(' — ')
  }
  if (err instanceof Error && err.message) return err.message
  return 'Error al guardar en la nube'
}

function sinMarca<T extends { id?: string; user_id?: string; created_at?: string }>(row: T) {
  const { id, user_id, created_at, ...patch } = row
  void id
  void user_id
  void created_at
  return patch
}

/** Update only if the row still has the updated_at we read. Otherwise return the cloud row. */
async function guardarActivo(row: AssetInsert, userId: string, id: string, baseUpdatedAt?: string): Promise<Asset> {
  if (!supabase) throw new Error('Supabase no configurado')
  if (baseUpdatedAt) {
    const { data, error } = await supabase
      .from('assets')
      .update(sinMarca(row))
      .eq('id', id)
      .eq('user_id', userId)
      .eq('updated_at', baseUpdatedAt)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(formatCloudError(error))
    if (data) return conFoto(dbAssetToLocal(data), userId)

    const current = await supabase.from('assets').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
    if (current.error) throw new Error(formatCloudError(current.error))
    if (current.data) throw new CloudConflictError(dbAssetToLocal(current.data))
  }

  const { data, error } = await supabase.from('assets').upsert(row, { onConflict: 'id' }).select('*').single()
  if (error) throw new Error(formatCloudError(error))
  return conFoto(dbAssetToLocal(data), userId)
}

async function guardarDeuda(row: LiabilityInsert, userId: string, id: string, baseUpdatedAt?: string): Promise<Asset> {
  if (!supabase) throw new Error('Supabase no configurado')
  if (baseUpdatedAt) {
    const { data, error } = await supabase
      .from('liabilities')
      .update(sinMarca(row))
      .eq('id', id)
      .eq('user_id', userId)
      .eq('updated_at', baseUpdatedAt)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(formatCloudError(error))
    if (data) return conFoto(dbLiabilityToLocal(data), userId)

    const current = await supabase.from('liabilities').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
    if (current.error) throw new Error(formatCloudError(current.error))
    if (current.data) throw new CloudConflictError(dbLiabilityToLocal(current.data))
  }

  const { data, error } = await supabase.from('liabilities').upsert(row, { onConflict: 'id' }).select('*').single()
  if (error) throw new Error(formatCloudError(error))
  return conFoto(dbLiabilityToLocal(data), userId)
}

function titulosDe(asset: Asset): { participaciones: number | null; precio: number | null } {
  const meta = asset.metadata
  const crudo = meta && 'participaciones' in meta ? Number(meta.participaciones) : Number.NaN
  const participaciones = Number.isFinite(crudo) && crudo > 0 ? crudo : null
  const valor = Number(asset.value)
  if (participaciones == null || !(valor > 0)) return { participaciones, precio: null }
  const declarado = meta && 'pricePerUnit' in meta ? Number(meta.pricePerUnit) : Number.NaN
  const precio = Number.isFinite(declarado) && declarado > 0 ? declarado : valor / participaciones
  return { participaciones, precio: Math.round(precio * 10000) / 10000 }
}

async function guardarFotoDia(asset: Asset, userId: string): Promise<void> {
  if (!supabase || !isUuid(asset.id) || !isUuid(userId)) return
  if (asset.readOnly || asset.source === 'finca') return
  const valor = Number(asset.value)
  if (!Number.isFinite(valor)) return
  const { participaciones, precio } = titulosDe(asset)
  try {
    const { error } = await supabase.from('position_snapshots').upsert(
      {
        user_id: userId,
        position_id: asset.id,
        kind: asset.category === 'debt' ? 'liability' : 'asset',
        fecha: fechaMadrid(),
        valor,
        participaciones,
        precio_por_participacion: precio,
      },
      { onConflict: 'user_id,position_id,fecha' },
    )
    if (error) console.warn('No se ha guardado la foto del día.', error.message)
  } catch (err) {
    const texto = err instanceof Error ? err.message : String(err)
    console.warn('No se ha guardado la foto del día.', texto.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://…'))
  }
}

async function conFoto(asset: Asset, userId: string): Promise<Asset> {
  await guardarFotoDia(asset, userId)
  return asset
}

/** Insert or update. Invalid local ids are replaced with a uuid. */
export async function saveCloudAsset(asset: Asset, userId: string, baseUpdatedAt?: string): Promise<Asset> {
  if (!supabase) throw new Error('Supabase no configurado')
  if (asset.readOnly || asset.source === 'finca') return asset

  const id = isUuid(asset.id) ? asset.id : crypto.randomUUID()
  const toSave = { ...asset, id }
  const base = baseUpdatedAt ?? asset.baseUpdatedAt

  if (toSave.category === 'debt') {
    const row = localDebtToLiabilityInsert(toSave, userId, id)
    if (!row) throw new Error('No se pudo mapear la deuda')
    return guardarDeuda(row, userId, id, base)
  }

  const row = localAssetToDbInsert(toSave, userId, id)
  if (!row) throw new Error('Categoría no sincronizable')
  return guardarActivo(row, userId, id, base)
}

export async function createCloudAsset(asset: Asset, userId: string): Promise<Asset> {
  return saveCloudAsset(asset, userId)
}

export async function updateCloudAsset(asset: Asset, userId: string, baseUpdatedAt?: string): Promise<Asset> {
  return saveCloudAsset(asset, userId, baseUpdatedAt)
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
  /** undefined: la lectura falló y no hay que pisar el valor local. null: no hay gasto real. */
  gastosReales?: import('../utils/gastos').GastosReales | null
}

function gastosDesdeFila(raw: unknown): import('../utils/gastos').GastosReales | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const fila = raw as Record<string, unknown>
  const media = Number(fila.mediaMensual)
  if (!Number.isFinite(media)) return null
  const desglose = desgloseDesde(fila.desglose)
  return {
    mediaMensual: media,
    meses: Number(fila.meses),
    fuente: typeof fila.fuente === 'string' ? fila.fuente : '',
    hasta: typeof fila.hasta === 'string' ? fila.hasta : '',
    actualizado: typeof fila.actualizado === 'string' ? fila.actualizado : '',
    ...(desglose ? { desglose } : {}),
  }
}

function desgloseDesde(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const salida: Record<string, number> = {}
  for (const [clave, valor] of Object.entries(raw)) {
    const n = Number(valor)
    if (Number.isFinite(n)) salida[clave] = n
  }
  return Object.keys(salida).length > 0 ? salida : undefined
}

export async function getProfileMonthlyExpenses(userId: string): Promise<number | null> {
  const s = await getProfileSettings(userId)
  return s.monthlyExpenses
}

export async function getProfileSettings(userId: string): Promise<ProfileSettings> {
  if (!supabase) return { monthlyExpenses: null, emergencyTargetMonths: null, gastosReales: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('monthly_expenses, emergency_target_months, gastos_reales')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.warn('getProfileSettings failed', error.message)
    return { monthlyExpenses: null, emergencyTargetMonths: null }
  }
  const row = data as {
    monthly_expenses?: number | null
    emergency_target_months?: number | null
    gastos_reales?: unknown
  } | null
  return {
    monthlyExpenses: row?.monthly_expenses != null ? Number(row.monthly_expenses) : null,
    emergencyTargetMonths:
      row?.emergency_target_months != null ? Number(row.emergency_target_months) : null,
    gastosReales: gastosDesdeFila(row?.gastos_reales),
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
      out.push(await saveCloudAsset(asset, userId, asset.baseUpdatedAt))
    } catch (err) {
      out.push(err instanceof CloudConflictError ? err.current : asset)
    }
  }
  return out
}

export { mergeCloudAndLocal, mergeCloudWithLocalRealEstate }
