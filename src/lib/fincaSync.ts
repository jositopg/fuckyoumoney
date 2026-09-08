import type { Asset } from '../types'
import type { FincaSnapshot } from './fincaSnapshot'
import { snapshotToAssets } from './fincaSnapshot'
import { supabase } from './supabase'

export async function syncFincaFromApi(): Promise<{ snapshot: FincaSnapshot; assets: Asset[] }> {
  if (!supabase) throw new Error('Supabase no configurado')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Inicia sesión para sincronizar Finca')

  const res = await fetch('/api/sync-finca', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Error ${res.status} al sincronizar Finca`)
  const snapshot = json.snapshot as FincaSnapshot
  return { snapshot, assets: snapshotToAssets(snapshot) }
}

export function replaceFincaAssets(current: Asset[], fincaAssets: Asset[]): Asset[] {
  const withoutOldFinca = current.filter(a => a.source !== 'finca' && !a.readOnly)
  const withoutLocalDupes = withoutOldFinca.filter(a => {
    if (a.category !== 'real_estate') return true
    return !fincaAssets.some(f => f.id === a.id || f.name === a.name)
  })
  return [...withoutLocalDupes, ...fincaAssets]
}
