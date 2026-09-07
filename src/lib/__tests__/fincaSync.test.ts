import { describe, expect, it } from 'vitest'
import type { Asset } from '../../types'
import { replaceFincaAssets } from '../fincaSync'

function asset(partial: Partial<Asset> & Pick<Asset, 'category' | 'name' | 'value'>): Asset {
  return {
    id: partial.id ?? partial.name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('replaceFincaAssets', () => {
  it('replaces finca rows and drops local duplicates by name', () => {
    const current: Asset[] = [
      asset({ id: 'cash', category: 'cash', name: 'Cuenta', value: 10 }),
      asset({ id: 'old-finca', category: 'real_estate', name: 'Piso A', value: 1, source: 'finca', readOnly: true }),
      asset({ id: 'manual-dup', category: 'real_estate', name: 'Piso B', value: 2 }),
    ]
    const incoming: Asset[] = [
      asset({ id: 'new-a', category: 'real_estate', name: 'Piso A', value: 100, source: 'finca', readOnly: true }),
      asset({ id: 'new-b', category: 'real_estate', name: 'Piso B', value: 200, source: 'finca', readOnly: true }),
    ]
    const next = replaceFincaAssets(current, incoming)
    expect(next.find(a => a.category === 'cash')?.value).toBe(10)
    expect(next.filter(a => a.category === 'real_estate')).toHaveLength(2)
    expect(next.find(a => a.name === 'Piso B')?.value).toBe(200)
    expect(next.find(a => a.name === 'Piso B')?.source).toBe('finca')
  })
})
