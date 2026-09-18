import { describe, expect, it } from 'vitest'
import type { Asset, StocksMetadata } from '../../types'
import { applyPriceResult, assetsDiffer } from '../applyPrices'

function asset(partial: Partial<Asset> & Pick<Asset, 'category' | 'name' | 'value'>): Asset {
  return {
    id: partial.id ?? partial.name,
    symbol: partial.symbol,
    notes: partial.notes,
    metadata: partial.metadata,
    source: partial.source,
    readOnly: partial.readOnly,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('applyPriceResult', () => {
  it('returns the same array when maps are empty', () => {
    const assets = [asset({ category: 'stocks', name: 'VWCE', value: 100, symbol: 'VWCE' })]
    const out = applyPriceResult(assets, { values: new Map(), resolvedTickers: new Map() })
    expect(out.assets).toBe(assets)
    expect(out.changed).toEqual([])
  })

  it('updates value and pricePerUnit from quantity', () => {
    const assets = [
      asset({
        category: 'stocks',
        name: 'VWCE',
        value: 100,
        symbol: 'VWCE',
        metadata: { quantity: 2, pricePerUnit: 50 } satisfies StocksMetadata,
      }),
    ]
    const out = applyPriceResult(
      assets,
      { values: new Map([['VWCE', 220]]), resolvedTickers: new Map() },
      '2026-09-18T12:00:00.000Z'
    )
    expect(out.changed).toHaveLength(1)
    expect(out.assets[0].value).toBe(220)
    expect((out.assets[0].metadata as StocksMetadata).pricePerUnit).toBe(110)
    expect(out.assets[0].updatedAt).toBe('2026-09-18T12:00:00.000Z')
  })

  it('caches resolved ticker without changing others', () => {
    const assets = [
      asset({
        category: 'stocks',
        name: 'Numantia',
        value: 50,
        symbol: 'ES0173311103',
        metadata: { identifierType: 'isin', quantity: 1 },
      }),
      asset({ category: 'cash', name: 'ING', value: 10 }),
    ]
    const out = applyPriceResult(assets, {
      values: new Map(),
      resolvedTickers: new Map([['Numantia', 'NUM.MC']]),
    })
    expect(out.changed).toHaveLength(1)
    expect((out.assets[0].metadata as StocksMetadata).resolvedTicker).toBe('NUM.MC')
    expect(out.assets[1]).toBe(assets[1])
  })
})

describe('assetsDiffer', () => {
  it('detects value changes', () => {
    const a = asset({ category: 'cash', name: 'A', value: 1 })
    const b = { ...a, value: 2 }
    expect(assetsDiffer([a], [b])).toEqual([b])
  })
})
