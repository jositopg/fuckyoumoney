import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

function env(name) {
  const v = process.env[name]
  return v ? v.replace(/^['"]|['"]$/g, '') : ''
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

function llmClient() {
  const xai = env('XAI_API_KEY')
  if (xai) {
    return {
      client: new OpenAI({ apiKey: xai, baseURL: 'https://api.x.ai/v1' }),
      model: 'grok-4.6',
    }
  }
  const gateway = env('AI_GATEWAY_API_KEY') || env('VERCEL_OIDC_TOKEN')
  if (!gateway) return null
  return {
    client: new OpenAI({ apiKey: gateway, baseURL: 'https://ai-gateway.vercel.sh/v1' }),
    model: 'xai/grok-4.6',
  }
}

function computeValue(row) {
  if (row.manual_value != null && Number(row.manual_value) > 0) return Number(row.manual_value)
  if (row.purchase_price != null && Number(row.quantity) > 0) {
    return Number(row.quantity) * Number(row.purchase_price)
  }
  return Number(row.manual_value ?? 0)
}

function briefFromRows(assets, liabilities, monthlyExpenses) {
  const positions = [
    ...assets.map(a => ({
      name: a.name,
      class: a.type,
      kind: 'asset',
      value: computeValue(a),
      liquid: Boolean(a.is_liquid),
      source: a.institution === 'finca' ? 'finca' : 'manual',
      notes: a.notes,
    })),
    ...liabilities.map(l => ({
      name: l.name,
      class: l.type,
      kind: 'liability',
      value: Number(l.balance || 0),
      liquid: false,
      source: 'manual',
    })),
  ]
  const totalAssets = positions.filter(p => p.kind === 'asset').reduce((s, p) => s + p.value, 0)
  const totalLiabilities = positions.filter(p => p.kind === 'liability').reduce((s, p) => s + p.value, 0)
  const liquid = positions.filter(p => p.liquid).reduce((s, p) => s + p.value, 0)
  const realEstate = positions.filter(p => p.class === 'real_estate').reduce((s, p) => s + p.value, 0)
  return {
    asOf: new Date().toISOString(),
    currency: 'EUR',
    totals: {
      netWorth: totalAssets - totalLiabilities,
      totalAssets,
      totalLiabilities,
      liquidAssets: liquid,
      realEstateValue: realEstate,
      monthlyExpenses: monthlyExpenses ?? 0,
    },
    positions,
    notesForModel: [
      'Cifras en EUR. No inventes números que no estén en este JSON.',
      'Inmuebles source=finca son de solo lectura; la gestión vive en Finca.',
      'Finca no envía principal de hipoteca. Las deudas están en kind=liability.',
      'Autonomía = (líquido − deudas) / gastos mensuales.',
    ],
  }
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const llm = llmClient()
  if (!llm) {
    return res.status(503).json({
      error: 'IA no configurada. Añade XAI_API_KEY (console.x.ai) o usa Vercel AI Gateway.',
    })
  }

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

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return res.status(400).json({ error: 'Falta message' })
  if (message.length > 4000) return res.status(400).json({ error: 'Mensaje demasiado largo' })

  const [assetsRes, liabRes, profileRes] = await Promise.all([
    supabase.from('assets').select('*').eq('user_id', userId),
    supabase.from('liabilities').select('*').eq('user_id', userId),
    supabase.from('profiles').select('monthly_expenses').eq('id', userId).maybeSingle(),
  ])
  if (assetsRes.error) return res.status(500).json({ error: assetsRes.error.message })
  if (liabRes.error) return res.status(500).json({ error: liabRes.error.message })

  const brief = briefFromRows(
    assetsRes.data ?? [],
    liabRes.data ?? [],
    profileRes.data?.monthly_expenses != null ? Number(profileRes.data.monthly_expenses) : 0
  )

  try {
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'Eres el analista de patrimonio de Jose en la app Fuck You Money. ' +
            'Hablas en español, claro y directo. Usas SOLO las cifras del JSON de patrimonio. ' +
            'Si falta un dato, lo dices. No das asesoramiento fiscal/legal vinculante; ' +
            'es una herramienta personal de lectura. Inmuebles source=finca no se editan aquí. ' +
            'JSON del patrimonio:\n' +
            JSON.stringify(brief),
        },
        { role: 'user', content: message },
      ],
    })
    const text = completion.choices[0]?.message?.content?.trim() || 'Sin respuesta'
    return res.status(200).json({ text })
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Error del modelo' })
  }
}
