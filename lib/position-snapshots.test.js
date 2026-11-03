import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/014_position_snapshots.sql'),
  'utf8',
)

describe('position_snapshots', () => {
  it('documenta la RLS, una fila por día y que la migración se puede repetir', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS')
    expect(sql).toContain('PRIMARY KEY (user_id, position_id, fecha)')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('DROP POLICY IF EXISTS position_snapshots_own')
    expect(sql).toContain('CREATE POLICY position_snapshots_own')
    expect(sql).toContain('FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_snapshots TO authenticated')
    expect(sql).toContain('position_snapshots_user_fecha_idx')
    expect(sql).toContain('ON CONFLICT (user_id, position_id, fecha)')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS')
    expect(sql).not.toContain('RETURNING')
  })
})
