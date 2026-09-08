import { describe, expect, it } from 'vitest'
import type { Asset } from '../../types'
import { buildWealthBrief } from '../wealthBrief'

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

describe('buildWealthBrief', () => {
  it('summarises net worth, allocation and finca rent', () => {
    const assets: Asset[] = [
      asset({ category: 'cash', name: 'Cuenta', value: 10000 }),
      asset({
        category: 'real_estate',
        name: 'Piso',
        value: 200000,
        source: 'finca',
        readOnly: true,
        metadata: { monthlyRent: 800 },
      }),
      asset({ category: 'debt', name: 'Hipoteca', value: 50000, metadata: { monthlyPayment: 400 } }),
    ]
    const brief = buildWealthBrief(assets, 2000, 6)
    expect(brief.totals.netWorth).toBe(160000)
    expect(brief.totals.realEstateValue).toBe(200000)
    expect(brief.totals.monthlyGrossPassive).toBe(800)
    expect(brief.totals.monthlyDebtPayments).toBe(400)
    expect(brief.totals.idleCash).toBe(10000)
    expect(brief.diagnosis.verdict).toBeTruthy()
    expect(brief.allocation.find(a => a.class === 'real_estate')?.pct).toBeGreaterThan(90)
    expect(brief.finca?.monthlyContractedRent).toBe(800)
    expect(brief.positions).toHaveLength(3)
    expect(brief.positions.find(p => p.class === 'cash')?.liquid).toBe(true)
    expect(brief.notesForModel.some(n => n.includes('ttmNetCashflow'))).toBe(true)
  })
})
