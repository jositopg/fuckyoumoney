import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/015_minusvalias_pendientes.sql'),
  'utf8',
)

describe('minusvalias_pendientes', () => {
  it('documenta la RLS, una fila por año y que la migración se puede repetir', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS')
    expect(sql).toContain('PRIMARY KEY (user_id, anio)')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('DROP POLICY IF EXISTS minusvalias_pendientes_own')
    expect(sql).toContain('CREATE POLICY minusvalias_pendientes_own')
    expect(sql).toContain('FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.minusvalias_pendientes TO authenticated')
    expect(sql).toContain('ON CONFLICT (user_id, anio)')
    expect(sql).not.toContain('RETURNING')
  })
})