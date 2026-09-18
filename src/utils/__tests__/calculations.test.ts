import { describe, it, expect } from 'vitest'
import type { Asset } from '../../types'
import {
  formatEur,
  formatMonths,
  getNetWorth,
  getLiquidAssets,
  getTotalDebts,
  getTotalPositiveAssets,
  getAutonomyMonths,
  getDebtRatio,
} from '../calculations'

// --- Test helpers ---
function makeAsset(overrides: Partial<Asset> & { category: Asset['category']; value: number }): Asset {
  return {
    id: 'test-id',
    name: 'Test Asset',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// --- formatEur ---
describe('formatEur', () => {
  it('formats zero', () => {
    expect(formatEur(0)).toContain('0')
  })

  it('formats positive integer', () => {
    const result = formatEur(1000)
    expect(result).toContain('1')
    expect(result).toContain('€')
  })

  it('formats negative value', () => {
    const result = formatEur(-5000)
    expect(result).toContain('-')
    expect(result).toContain('€')
  })

  it('non-compact does not use K notation for thousands', () => {
    const result = formatEur(50000, false)
    expect(result).not.toContain('K')
  })

  it('compact uses abbreviated notation for values >= 1000', () => {
    const result = formatEur(50000, true)
    // Compact notation in es-ES locale uses "mil" abbreviation
    expect(result).toMatch(/mil|M|k/i)
  })

  it('compact does not abbreviate values < 1000', () => {
    const result = formatEur(500, true)
    expect(result).toContain('500')
  })

  it('formats large negative value in compact', () => {
    const result = formatEur(-100000, true)
    expect(result).toContain('-')
  })
})

// --- formatMonths ---
describe('formatMonths', () => {
  it('returns 0 for 0 months', () => {
    expect(formatMonths(0)).toBe('0')
  })

  it('returns 0 for negative months', () => {
    expect(formatMonths(-5)).toBe('0')
  })

  it('returns 0 for Infinity', () => {
    expect(formatMonths(Infinity)).toBe('0')
  })

  it('returns decimal for less than 12 months', () => {
    expect(formatMonths(1.5)).toBe('1.5')
  })

  it('rounds to 1 decimal for less than 12', () => {
    expect(formatMonths(5)).toBe('5')
  })

  it('returns year format for exactly 12', () => {
    expect(formatMonths(12)).toBe('1 año')
  })

  it('returns plural years for 24', () => {
    expect(formatMonths(24)).toBe('2 años')
  })

  it('returns years + months for 18', () => {
    expect(formatMonths(18)).toBe('1a 6m')
  })

  it('returns year without remainder when month rounds to 0', () => {
    expect(formatMonths(12.1)).toBe('1 año')
  })

  it('handles 36 months', () => {
    expect(formatMonths(36)).toBe('3 años')
  })
})

// --- getNetWorth ---
describe('getNetWorth', () => {
  it('returns 0 for empty array', () => {
    expect(getNetWorth([])).toBe(0)
  })

  it('sums positive assets', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 1000 }),
      makeAsset({ category: 'stocks', value: 5000 }),
    ]
    expect(getNetWorth(assets)).toBe(6000)
  })

  it('subtracts debt from net worth', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 10000 }),
      makeAsset({ category: 'debt', value: 3000 }),
    ]
    expect(getNetWorth(assets)).toBe(7000)
  })

  it('handles all debts', () => {
    const assets = [
      makeAsset({ category: 'debt', value: 5000 }),
    ]
    expect(getNetWorth(assets)).toBe(-5000)
  })

  it('handles mixed assets', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 2000 }),
      makeAsset({ category: 'stocks', value: 3000 }),
      makeAsset({ category: 'crypto', value: 1000 }),
      makeAsset({ category: 'debt', value: 4000 }),
    ]
    expect(getNetWorth(assets)).toBe(2000)
  })
})

// --- getLiquidAssets ---
describe('getLiquidAssets', () => {
  it('returns 0 for empty array', () => {
    expect(getLiquidAssets([])).toBe(0)
  })

  it('includes cash, stocks, crypto', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 1000 }),
      makeAsset({ category: 'stocks', value: 2000 }),
      makeAsset({ category: 'crypto', value: 500 }),
    ]
    expect(getLiquidAssets(assets)).toBe(3500)
  })

  it('excludes real_estate, vehicles, pension, debt', () => {
    const assets = [
      makeAsset({ category: 'real_estate', value: 200000 }),
      makeAsset({ category: 'vehicles', value: 15000 }),
      makeAsset({ category: 'pension', value: 50000 }),
      makeAsset({ category: 'debt', value: 10000 }),
    ]
    expect(getLiquidAssets(assets)).toBe(0)
  })

  it('excludes debt from liquid total', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 5000 }),
      makeAsset({ category: 'debt', value: 2000 }),
    ]
    expect(getLiquidAssets(assets)).toBe(5000)
  })
})

// --- getTotalDebts ---
describe('getTotalDebts', () => {
  it('returns 0 for no debt assets', () => {
    expect(getTotalDebts([makeAsset({ category: 'cash', value: 1000 })])).toBe(0)
  })

  it('returns sum of debt values', () => {
    const assets = [
      makeAsset({ category: 'debt', value: 3000 }),
      makeAsset({ category: 'debt', value: 2000 }),
      makeAsset({ category: 'cash', value: 5000 }),
    ]
    expect(getTotalDebts(assets)).toBe(5000)
  })

  it('treats debt values as positive (absolute value)', () => {
    const assets = [makeAsset({ category: 'debt', value: 1000 })]
    expect(getTotalDebts(assets)).toBe(1000)
  })
})

// --- getTotalPositiveAssets ---
describe('getTotalPositiveAssets', () => {
  it('returns 0 for empty array', () => {
    expect(getTotalPositiveAssets([])).toBe(0)
  })

  it('excludes debt category', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 1000 }),
      makeAsset({ category: 'debt', value: 5000 }),
      makeAsset({ category: 'stocks', value: 2000 }),
    ]
    expect(getTotalPositiveAssets(assets)).toBe(3000)
  })

  it('sums all non-debt categories', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 1000 }),
      makeAsset({ category: 'stocks', value: 2000 }),
      makeAsset({ category: 'crypto', value: 500 }),
      makeAsset({ category: 'real_estate', value: 100000 }),
      makeAsset({ category: 'vehicles', value: 15000 }),
      makeAsset({ category: 'pension', value: 20000 }),
    ]
    expect(getTotalPositiveAssets(assets)).toBe(138500)
  })
})

// --- getAutonomyMonths ---
describe('getAutonomyMonths', () => {
  it('returns Infinity when monthlyExpenses is 0', () => {
    const assets = [makeAsset({ category: 'cash', value: 1000 })]
    expect(getAutonomyMonths(assets, 0)).toBe(Infinity)
  })

  it('returns Infinity when monthlyExpenses is negative', () => {
    expect(getAutonomyMonths([], -100)).toBe(Infinity)
  })

  it('calculates months based on liquid assets minus debts', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 6000 }),
      makeAsset({ category: 'debt', value: 1000 }),
    ]
    expect(getAutonomyMonths(assets, 1000)).toBe(5)
  })

  it('returns negative when debts exceed liquid', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 1000 }),
      makeAsset({ category: 'debt', value: 5000 }),
    ]
    expect(getAutonomyMonths(assets, 1000)).toBe(-4)
  })

  it('ignores illiquid assets for autonomy calculation', () => {
    const assets = [
      makeAsset({ category: 'real_estate', value: 500000 }),
      makeAsset({ category: 'cash', value: 3000 }),
    ]
    expect(getAutonomyMonths(assets, 1000)).toBe(3)
  })
})

// --- getDebtRatio ---
describe('getDebtRatio', () => {
  it('returns 0 when there are no positive assets', () => {
    expect(getDebtRatio([])).toBe(0)
  })

  it('returns 0 when total positive is 0', () => {
    const assets = [makeAsset({ category: 'debt', value: 5000 })]
    expect(getDebtRatio(assets)).toBe(0)
  })

  it('calculates debt ratio correctly', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 10000 }),
      makeAsset({ category: 'debt', value: 2000 }),
    ]
    expect(getDebtRatio(assets)).toBeCloseTo(0.2)
  })

  it('returns 0 when no debt', () => {
    const assets = [makeAsset({ category: 'cash', value: 5000 })]
    expect(getDebtRatio(assets)).toBe(0)
  })
})
