import { describe, expect, it } from 'vitest'
import type { Asset, StocksMetadata } from '../../types'
import {
  CASH_STALE_DAYS,
  daysSince,
  formatAsOf,
  formatEurInput,
  isCashStale,
  parseEur,
  setAssetValue,
} from '../declaredValue'

const NOW = Date.parse('2026-09-18T12:00:00.000Z')

function asset(partial: Partial<Asset> & Pick<Asset, 'category' | 'name' | 'value'>): Asset {
  return {
    id: partial.id ?? partial.name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  }
}

describe('parseEur', () => {
  it('reads a plain integer', () => {
    expect(parseEur('205021')).toBe(205021)
  })

  it('reads Spanish thousands and decimals', () => {
    expect(parseEur('1.234,50')).toBe(1234.5)
  })

  it('strips euro sign', () => {
    expect(parseEur('  90 € ')).toBe(90)
  })
})

describe('formatEurInput', () => {
  it('keeps integers unadorned', () => {
    expect(formatEurInput(205021)).toBe('205021')
  })

  it('uses comma decimals', () => {
    expect(formatEurInput(20.5)).toBe('20,50')
  })
})

describe('formatAsOf', () => {
  it('says hoy / ayer / hace N / fecha', () => {
    expect(formatAsOf('2026-09-18T08:00:00.000Z', NOW)).toBe('hoy')
    expect(formatAsOf('2026-09-17T08:00:00.000Z', NOW)).toBe('ayer')
    expect(formatAsOf('2026-09-14T08:00:00.000Z', NOW)).toBe('hace 4 días')
    expect(formatAsOf('2026-08-01T08:00:00.000Z', NOW)).toMatch(/ago|1/i)
  })
})

describe('isCashStale', () => {
  it('flags cash older than the threshold', () => {
    const old = asset({
      category: 'cash',
      name: 'BBVA',
      value: 1,
      updatedAt: new Date(NOW - CASH_STALE_DAYS * 86400000).toISOString(),
    })
    expect(isCashStale(old, NOW)).toBe(true)
    expect(daysSince(old.updatedAt, NOW)).toBe(CASH_STALE_DAYS)
  })

  it('ignores funds', () => {
    expect(
      isCashStale(asset({ category: 'stocks', name: 'VWCE', value: 1, updatedAt: '2020-01-01T00:00:00.000Z' }), NOW)
    ).toBe(false)
  })
})

describe('setAssetValue', () => {
  it('writes the declared number and timestamp', () => {
    const a = asset({ category: 'cash', name: 'ING', value: 100 })
    const next = setAssetValue(a, 90, '2026-09-18T12:00:00.000Z')
    expect(next.value).toBe(90)
    expect(next.updatedAt).toBe('2026-09-18T12:00:00.000Z')
    expect(next.name).toBe('ING')
  })

  it('recomputes pricePerUnit when there is quantity', () => {
    const a = asset({
      category: 'stocks',
      name: 'VWCE',
      value: 100,
      metadata: { quantity: 4, pricePerUnit: 25 } satisfies StocksMetadata,
    })
    const next = setAssetValue(a, 200, '2026-09-18T12:00:00.000Z')
    expect((next.metadata as StocksMetadata).pricePerUnit).toBe(50)
  })
})
