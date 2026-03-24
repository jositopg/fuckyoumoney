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
  getEmergencyFundMonths,
  getDebtRatio,
  getAutonomyLevel,
  getContextualMessage,
  getDiversificationWarning,
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

// --- getEmergencyFundMonths ---
describe('getEmergencyFundMonths', () => {
  it('returns Infinity when expenses is 0', () => {
    expect(getEmergencyFundMonths([], 0)).toBe(Infinity)
  })

  it('returns liquid / expenses', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 6000 }),
      makeAsset({ category: 'stocks', value: 3000 }),
    ]
    expect(getEmergencyFundMonths(assets, 3000)).toBe(3)
  })

  it('does not subtract debts (pure liquid coverage)', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 6000 }),
      makeAsset({ category: 'debt', value: 3000 }),
    ]
    expect(getEmergencyFundMonths(assets, 1000)).toBe(6)
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

// --- getAutonomyLevel ---
describe('getAutonomyLevel', () => {
  it('handles negative months', () => {
    const level = getAutonomyLevel(-1)
    expect(level.label).toBe('Tu punto de partida')
  })

  it('handles Infinity', () => {
    const level = getAutonomyLevel(Infinity)
    expect(level.label).toBe('Tu punto de partida')
  })

  it('handles 0 months (treated as < 3, building base)', () => {
    const level = getAutonomyLevel(0)
    expect(level.label).toBe('Estás construyendo tu base')
  })

  it('returns building label for < 3 months (e.g. 1)', () => {
    const level = getAutonomyLevel(1)
    expect(level.label).toBe('Estás construyendo tu base')
  })

  it('returns solid cushion for 3-5 months', () => {
    const level = getAutonomyLevel(4)
    expect(level.label).toBe('Tienes un colchón sólido')
  })

  it('returns real margin for 6-11 months', () => {
    const level = getAutonomyLevel(8)
    expect(level.label).toBe('Tienes margen real')
  })

  it('returns autonomy for 12-23 months', () => {
    const level = getAutonomyLevel(18)
    expect(level.label).toBe('Tienes autonomía')
  })

  it('returns freedom for 24+ months', () => {
    const level = getAutonomyLevel(24)
    expect(level.label).toBe('Tienes libertad')
  })

  it('returns freedom for exactly 36 months', () => {
    const level = getAutonomyLevel(36)
    expect(level.label).toBe('Tienes libertad')
  })
})

// --- getContextualMessage ---
describe('getContextualMessage', () => {
  it('returns starting point message when netWorth=0 and months<=0', () => {
    const msg = getContextualMessage(0, 0, 0)
    expect(msg).toContain('punto de partida')
  })

  it('returns debt message when debtRatio > 0.5', () => {
    const msg = getContextualMessage(12, 10000, 0.6)
    expect(msg).toContain('deuda')
  })

  it('returns message for months < 1 (not starting point)', () => {
    const msg = getContextualMessage(0.5, 500, 0)
    expect(msg).toContain('opciones')
  })

  it('returns message for months < 3', () => {
    const msg = getContextualMessage(2, 2000, 0)
    expect(msg).toContain('no')
  })

  it('returns cushion message for months < 6', () => {
    const msg = getContextualMessage(4, 4000, 0)
    expect(msg).toContain('colchón')
  })

  it('returns margin message for months < 12', () => {
    const msg = getContextualMessage(8, 8000, 0)
    expect(msg).toContain('margen')
  })

  it('returns autonomy message for months < 24', () => {
    const msg = getContextualMessage(18, 18000, 0)
    expect(msg).toContain('autonomía')
  })

  it('returns freedom message for months >= 24', () => {
    const msg = getContextualMessage(30, 30000, 0)
    expect(msg).toContain('libertad')
  })
})

// --- getDiversificationWarning ---
describe('getDiversificationWarning', () => {
  it('returns null for empty assets', () => {
    expect(getDiversificationWarning([])).toBeNull()
  })

  it('returns null when no category > 70%', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 3000 }),
      makeAsset({ category: 'stocks', value: 4000 }),
      makeAsset({ category: 'crypto', value: 3000 }),
    ]
    expect(getDiversificationWarning(assets)).toBeNull()
  })

  it('returns warning when one category > 70%', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 8000 }),
      makeAsset({ category: 'stocks', value: 2000 }),
    ]
    const warning = getDiversificationWarning(assets)
    expect(warning).not.toBeNull()
    expect(warning).toContain('efectivo')
  })

  it('returns warning for crypto concentration', () => {
    const assets = [
      makeAsset({ category: 'crypto', value: 9000 }),
      makeAsset({ category: 'cash', value: 1000 }),
    ]
    const warning = getDiversificationWarning(assets)
    expect(warning).toContain('cripto')
  })

  it('ignores debt in diversification calculation', () => {
    const assets = [
      makeAsset({ category: 'cash', value: 3000 }),
      makeAsset({ category: 'stocks', value: 4000 }),
      makeAsset({ category: 'debt', value: 100000 }),
    ]
    // Debt should not count as a category or affect the denominator
    expect(getDiversificationWarning(assets)).toBeNull()
  })

  it('returns null when total positive is 0', () => {
    const assets = [makeAsset({ category: 'debt', value: 5000 })]
    expect(getDiversificationWarning(assets)).toBeNull()
  })

  it('returns warning for exactly 71% concentration', () => {
    const assets = [
      makeAsset({ category: 'real_estate', value: 71000 }),
      makeAsset({ category: 'cash', value: 29000 }),
    ]
    const warning = getDiversificationWarning(assets)
    expect(warning).not.toBeNull()
    expect(warning).toContain('inmuebles')
  })
})
