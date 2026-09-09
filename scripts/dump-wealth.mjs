#!/usr/bin/env node
// Briefing de patrimonio para Grok en terminal.
// No hay chat en la app: esta es la vía. Cifras en EUR.
//
//   node scripts/dump-wealth.mjs
//
// Lee:
//   ~/.finca-db.env            → snapshot inmobiliario (siempre)
//   ~/.fuckyoumoney-db.env     → activos/pasivos FYM (si existe)

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

function loadEnvFile(name) {
  const path = join(homedir(), name)
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

async function query(url, sql) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const res = await client.query(sql)
    return res.rows
  } finally {
    await client.end()
  }
}

function num(v) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const finca = loadEnvFile('.finca-db.env')
  const fym = loadEnvFile('.fuckyoumoney-db.env')

  const out = {
    asOf: new Date().toISOString(),
    currency: 'EUR',
    notesForModel: [
      'Cifras en EUR. No inventes números que no estén en este JSON.',
      'Si fuckyoumoney.diagnosis existe, lee verdict y headline antes de opinar.',
      'Efectivo: emergency / parked / working / idle. parked no es colchón. stocks/crypto NO son emergencia.',
      'Inmuebles: usa totals.ttmNetCashflow (neto 12 meses), no monthlyContractedRent como si fuera neto.',
      'Los inmuebles source=finca son de solo lectura; la gestión vive en la app Finca.',
      'Finca no envía principal de hipoteca. Si hay hipotecas, están en FYM liabilities.',
      'Autonomía = (efectivo − deudas) / gastos mensuales. El ladrillo no cuenta para autonomía.',
      'Mezcla: bandas, no un % mágico. Landlord: ladrillo 50–70, fondos 20–35. Financial: fondos 60–85, ladrillo 0–25. Colchón = N meses, no un % del neto. Ladrillo alto no implica vender si mix.stance ≠ divest_brick.',
    ],
    sources: { finca: false, fuckyoumoney: false },
    finca: null,
    fuckyoumoney: null,
  }

  if (finca.DATABASE_URL) {
    const rows = await query(finca.DATABASE_URL, 'SELECT public.patrimonio_macro_snapshot() AS snap')
    out.finca = rows[0]?.snap ?? null
    out.sources.finca = Boolean(out.finca)
  }

  if (fym.DATABASE_URL) {
    try {
      const brief = await query(fym.DATABASE_URL, 'SELECT public.patrimonio_ia() AS snap')
      if (brief[0]?.snap) {
        out.fuckyoumoney = brief[0].snap
        out.sources.fuckyoumoney = true
      }
    } catch {
      // migración 001 aún no aplicada: leer tablas crudas
    }
  }

  if (fym.DATABASE_URL && !out.sources.fuckyoumoney) {
    const assets = await query(
      fym.DATABASE_URL,
      `SELECT id, name, type, quantity, purchase_price, manual_value, is_liquid,
              institution, currency, notes, ticker
         FROM public.assets ORDER BY type, name`
    )
    const liabilities = await query(
      fym.DATABASE_URL,
      `SELECT id, name, type, balance, interest_rate, monthly_payment, institution, notes
         FROM public.liabilities ORDER BY type, name`
    )
    const profiles = await query(
      fym.DATABASE_URL,
      `SELECT id, monthly_expenses, display_currency FROM public.profiles`
    )

    const positions = [
      ...assets.map(a => {
        const value =
          a.manual_value != null && Number(a.manual_value) > 0
            ? Number(a.manual_value)
            : num(a.quantity) * num(a.purchase_price)
        return {
          id: a.id,
          name: a.name,
          class: a.type,
          kind: 'asset',
          value,
          liquid: Boolean(a.is_liquid),
          source: a.institution === 'finca' ? 'finca' : 'manual',
          institution: a.institution,
          ticker: a.ticker,
          notes: a.notes,
        }
      }),
      ...liabilities.map(l => ({
        id: l.id,
        name: l.name,
        class: l.type,
        kind: 'liability',
        value: num(l.balance),
        liquid: false,
        source: 'manual',
        institution: l.institution,
        interestRate: l.interest_rate != null ? Number(l.interest_rate) : null,
        monthlyPayment: l.monthly_payment != null ? Number(l.monthly_payment) : null,
        notes: l.notes,
      })),
    ]

    const totalAssets = positions.filter(p => p.kind === 'asset').reduce((s, p) => s + p.value, 0)
    const totalLiabilities = positions.filter(p => p.kind === 'liability').reduce((s, p) => s + p.value, 0)
    const liquid = positions.filter(p => p.liquid).reduce((s, p) => s + p.value, 0)
    const realEstate = positions.filter(p => p.class === 'real_estate').reduce((s, p) => s + p.value, 0)
    const expenses = profiles[0]?.monthly_expenses != null ? Number(profiles[0].monthly_expenses) : 0

    out.fuckyoumoney = {
      totals: {
        netWorth: totalAssets - totalLiabilities,
        totalAssets,
        totalLiabilities,
        liquidAssets: liquid,
        realEstateValue: realEstate,
        monthlyExpenses: expenses,
      },
      positions,
    }
    out.sources.fuckyoumoney = true
  }

  if (!out.sources.finca && !out.sources.fuckyoumoney) {
    console.error('No hay ~/.finca-db.env ni ~/.fuckyoumoney-db.env')
    process.exit(1)
  }

  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
