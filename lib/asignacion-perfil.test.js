import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/017_asignacion_objetivo.sql'),
  'utf8',
)

describe('asignacion_objetivo', () => {
  it('añade la columna sin inventar un objetivo ni reescribir el diagnóstico', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS asignacion_objetivo jsonb')
    expect(sql).not.toContain('INSERT')
    expect(sql).not.toContain('UPDATE')
    expect(sql).not.toContain('RETURNING')
    expect(sql).not.toContain('patrimonio_ia')
  })
})