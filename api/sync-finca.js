import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

const FYM_META_PREFIX = 'FYM1:'

function loadFincaDatabaseUrl() {
  if (process.env.FINCA_DATABASE_URL) return process.env.FINCA_DATABASE_URL
  const path = join(homedir(), '.finca-db.env')
  if (!existsSync(path)) return null
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^DATABASE_URL=(.*)$/.exec(line.trim())
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  }
  return null
}

function env(name) {
  const v = process.env[name]
  return v ? v.replace(/^['"]|['"]$/g, '') : ''
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

function packNotes(extra) {
  return FYM_META_PREFIX + JSON.stringify(extra)
}

function propertyType(p) {
  if (p.status === 'vivienda_habitual') return 'vivienda_habitual'
  if (p.type === 'local') return 'local'
  if (p.type === 'garaje') return 'garaje'
  if (p.status === 'uso_propio') return 'otro'
  return 'alquiler'
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Falta sesión' })

  const supabaseUrl = env('VITE_SUPABASE_URL') || env('SUPABASE_URL')
  const supabaseAnon = env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnon) {
    return res.status(500).json({ error: 'Supabase no configurado en el servidor' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return res.status(401).json({ error: 'Sesión inválida' })
  const userId = userData.user.id

  const fincaUrl = loadFincaDatabaseUrl()
  if (!fincaUrl) {
    return res.status(503).json({
      error: 'FINCA_DATABASE_URL no configurada. Añádela en Vercel (mismo valor que ~/.finca-db.env).',
    })
  }

  const client = new pg.Client({ connectionString: fincaUrl, ssl: { rejectUnauthorized: false } })
  let snapshot
  try {
    await client.connect()
    const result = await client.query('SELECT public.patrimonio_macro_snapshot() AS snap')
    snapshot = result.rows[0]?.snap
  } catch (err) {
    return res.status(502).json({ error: `Finca DB: ${err instanceof Error ? err.message : 'error'}` })
  } finally {
    await client.end().catch(() => {})
  }

  if (!snapshot || !Array.isArray(snapshot.properties)) {
    return res.status(502).json({ error: 'Snapshot de Finca vacío o inválido' })
  }

  const now = new Date().toISOString()
  const rows = snapshot.properties.map(p => {
    const extra = {
      source: 'finca',
      propertyType: propertyType(p),
      monthlyRent: Number(p.monthlyContractedRent || 0),
      status: p.status,
      ownershipPct: Number(p.ownershipPct || 100),
      valueSource: p.valueSource,
      municipio: p.municipio,
      fincaId: p.id,
      ttmNetCashflow: p.ttmNetCashflow != null ? Number(p.ttmNetCashflow) : undefined,
    }
    return {
      id: p.id,
      user_id: userId,
      name: p.name,
      type: 'real_estate',
      quantity: 1,
      manual_value: Number(p.ownerShareValue || 0),
      currency: 'EUR',
      institution: 'finca',
      country: p.municipio || null,
      notes: packNotes(extra),
      is_liquid: false,
      ticker: null,
      ticker_source: null,
      purchase_price: null,
      source: 'finca',
      read_only: true,
      created_at: now,
      updated_at: now,
    }
  })

  const incomingIds = rows.map(r => r.id)

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from('assets').upsert(rows, { onConflict: 'id' })
    if (upsertError) return res.status(500).json({ error: upsertError.message })
  }

  // Inmuebles = Finca. Fuera duplicados manuales y pisos que ya no están.
  const { data: existing, error: listError } = await supabase
    .from('assets')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'real_estate')
  if (listError) return res.status(500).json({ error: listError.message })

  const staleIds = (existing ?? []).map(r => r.id).filter(id => !incomingIds.includes(id))
  if (staleIds.length > 0) {
    const { error: delError } = await supabase
      .from('assets')
      .delete()
      .eq('user_id', userId)
      .in('id', staleIds)
    if (delError) return res.status(500).json({ error: delError.message })
  }

  return res.status(200).json({ ok: true, snapshot })
}
