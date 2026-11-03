import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/016_gastos_reales.sql'),
  'utf8',
)

describe('gastos_reales', () => {
  it('añade la columna sin inventar cifras y el diagnóstico caduca a los 60 días', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS gastos_reales jsonb')
    expect(sql).toContain("now() - interval '60 days'")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.patrimonio_ia()')
    expect(sql).toContain("'origen', gasto_origen")
    expect(sql).not.toContain('INSERT INTO')
    expect(sql).not.toContain('RETURNING')
  })
})