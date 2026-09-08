import { describe, expect, it } from 'vitest'
import type { Asset } from '../../types'
import {
  cashJob,
  deployableCash,
  diagnoseWealth,
  moneyBuckets,
  realEstateYield,
} from '../moneyDiagnosis'

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

describe('cashJob', () => {
  it('defaults to idle', () => {
    expect(cashJob(asset({ category: 'cash', name: 'A', value: 100 }))).toBe('idle')
  })

  it('does not treat TAE as a reason to keep cash', () => {
    expect(
      cashJob(asset({ category: 'cash', name: 'A', value: 100, metadata: { interestRate: 2 } }))
    ).toBe('idle')
    expect(
      cashJob(
        asset({
          category: 'cash',
          name: 'A',
          value: 100,
          metadata: { job: 'working', interestRate: 2 },
        })
      )
    ).toBe('idle')
  })

  it('keeps parked even with TAE', () => {
    expect(
      cashJob(
        asset({
          category: 'cash',
          name: 'A',
          value: 100,
          metadata: { job: 'parked', interestRate: 2, parkedReason: 'impuestos' },
        })
      )
    ).toBe('parked')
  })
})

describe('moneyBuckets', () => {
  it('splits cash into exclusive jobs', () => {
    const b = moneyBuckets([
      asset({ category: 'cash', name: 'Colchón', value: 6000, metadata: { job: 'emergency' } }),
      asset({ category: 'cash', name: 'Reforma', value: 4000, metadata: { job: 'parked', parkedReason: 'reforma' } }),
      asset({ category: 'cash', name: 'TR', value: 3000, metadata: { job: 'working', interestRate: 2 } }),
      asset({ category: 'cash', name: 'Corriente', value: 2000 }),
      asset({ category: 'stocks', name: 'VWCE', value: 50000 }),
    ])
    expect(b).toMatchObject({
      emergency: 6000,
      parked: 4000,
      idle: 5000,
      toInvest: 5000,
      emergencyAssumed: false,
      emergencyAssigned: 6000,
    })
  })

  it('assumes unparked cash is cushion when nothing is tagged emergency', () => {
    const b = moneyBuckets([
      asset({ category: 'cash', name: 'A', value: 5000 }),
      asset({ category: 'cash', name: 'B', value: 2000, metadata: { interestRate: 1 } }),
      asset({ category: 'cash', name: 'C', value: 1000, metadata: { job: 'parked', parkedReason: 'entrada' } }),
    ])
    expect(b.emergencyAssumed).toBe(true)
    expect(b.emergency).toBe(7000)
    expect(b.idle).toBe(7000)
    expect(b.toInvest).toBe(7000)
    expect(b.parked).toBe(1000)
  })
})

describe('realEstateYield', () => {
  it('separates habitual value and uses TTM net not contracted rent', () => {
    const y = realEstateYield([
      asset({
        category: 'real_estate',
        name: 'Piso',
        value: 200000,
        metadata: {
          propertyType: 'alquiler',
          status: 'alquilado',
          monthlyRent: 800,
          ttmNetCashflow: 6000,
          valueSource: 'mercado',
        },
      }),
      asset({
        category: 'real_estate',
        name: 'Casa',
        value: 150000,
        metadata: {
          propertyType: 'vivienda_habitual',
          status: 'vivienda_habitual',
          valueSource: 'catastro',
        },
      }),
    ])
    expect(y.value).toBe(350000)
    expect(y.rentalValue).toBe(200000)
    expect(y.habitualValue).toBe(150000)
    expect(y.monthlyGrossRent).toBe(800)
    expect(y.ttmNetCashflow).toBe(6000)
    expect(y.monthlyNet).toBe(500)
    expect(y.netYieldPct).toBe(3)
    expect(y.grossYieldPct).toBe(4.8)
    expect(y.missingMarketValue).toBe(1)
    expect(y.rented).toBe(1)
  })
})

describe('diagnoseWealth', () => {
  it('asks for expenses before judging', () => {
    const d = diagnoseWealth([asset({ category: 'cash', name: 'A', value: 10000 })], 0)
    expect(d.verdict).toBe('unknown')
    expect(d.questions.some(q => q.id === 'expenses')).toBe(true)
    expect(d.questions.some(q => q.id === 'emergency_target')).toBe(true)
    expect(d.missing).toContain('monthly_expenses')
  })

  it('asks what idle cash is for and does not treat stocks as emergency', () => {
    const d = diagnoseWealth(
      [
        asset({ category: 'cash', name: 'Corriente', value: 2000 }),
        asset({ category: 'stocks', name: 'VWCE', value: 80000 }),
      ],
      2000,
      6
    )
    expect(d.cashflow.emergencyHave).toBe(2000)
    expect(d.cashflow.emergencyMonths).toBe(1)
    expect(d.cashflow.emergencyGap).toBe(10000)
    expect(d.questions.some(q => q.id === 'idle_cash')).toBe(true)
    expect(d.actions.some(a => a.id === 'fill_emergency')).toBe(true)
    expect(d.verdict).toBe('ok')
  })

  it('flags idle leftover after the cushion is full', () => {
    const d = diagnoseWealth(
      [
        asset({ category: 'cash', name: 'Colchón', value: 12000, metadata: { job: 'emergency' } }),
        asset({ category: 'cash', name: 'Sobrante', value: 8000 }),
      ],
      2000,
      6
    )
    expect(d.cashflow.emergencyGap).toBe(0)
    expect(d.buckets.idle).toBe(8000)
    expect(d.capital.deployable).toBe(8000)
    expect(d.moves.some(m => m.id === 'deploy_idle' && m.stance === 'deploy')).toBe(true)
    expect(d.headline).toMatch(/fondos/)
    expect(d.verdict).toBe('ok')
  })

  it('splits untagged cash into cushion vs deployable when expenses are known', () => {
    const d = diagnoseWealth(
      [
        asset({ category: 'cash', name: 'BBVA', value: 30000 }),
        asset({ category: 'stocks', name: 'VWCE', value: 10000 }),
      ],
      2000,
      6
    )
    expect(d.capital.deployable).toBe(18000)
    expect(d.capital.invested).toBe(10000)
    expect(d.moves.some(m => m.id === 'fill_emergency')).toBe(false)
    expect(d.moves.find(m => m.id === 'hold_cushion')?.amount).toBe(12000)
    expect(d.moves.find(m => m.id === 'deploy_idle')?.amount).toBe(18000)
    expect(d.moves.find(m => m.id === 'deploy_idle')?.detail).toMatch(/ya está invertido/)
  })

  it('does not treat fund NAV as something to sell', () => {
    const d = diagnoseWealth(
      [
        asset({ category: 'cash', name: 'Colchón', value: 12000, metadata: { job: 'emergency' } }),
        asset({
          category: 'stocks',
          name: 'VWCE',
          value: 40000,
          metadata: { purchasePrice: 50, pricePerUnit: 40, quantity: 1000 },
        }),
      ],
      2000,
      6
    )
    expect(d.capital.invested).toBe(40000)
    expect(d.capital.deployable).toBe(0)
    expect(d.moves.some(m => m.stance === 'deploy')).toBe(false)
    expect(d.verdict).toBe('solid')
  })

  it('sends remunerated cash that is not cushion or earmarked to invest', () => {
    const d = diagnoseWealth(
      [
        asset({
          category: 'cash',
          name: 'Colchón',
          value: 12000,
          metadata: { job: 'emergency', interestRate: 2 },
        }),
        asset({
          category: 'cash',
          name: 'Remunerada extra',
          value: 20000,
          metadata: { interestRate: 3 },
        }),
        asset({
          category: 'cash',
          name: 'Juicio',
          value: 8000,
          metadata: { job: 'parked', parkedReason: 'Juicio' },
        }),
      ],
      2000,
      6
    )
    expect(d.buckets.toInvest).toBe(20000)
    expect(d.capital.deployable).toBe(20000)
    expect(d.buckets.parked).toBe(8000)
    expect(d.moves.find(m => m.id === 'deploy_idle')?.amount).toBe(20000)
    expect(d.moves.some(m => m.amount === 8000 && m.stance === 'leave')).toBe(false)
  })

  it('returns 0 deployable until expenses are known', () => {
    const b = moneyBuckets([asset({ category: 'cash', name: 'A', value: 50000 })])
    expect(deployableCash(b, 12000, 0)).toBe(0)
    expect(deployableCash(b, 12000, 2000)).toBe(38000)
  })

  it('asks why parked cash has no reason', () => {
    const d = diagnoseWealth(
      [asset({ category: 'cash', name: 'Reserva', value: 5000, metadata: { job: 'parked' } })],
      2000,
      6
    )
    expect(d.questions.some(q => q.id === 'parked_reason')).toBe(true)
  })

  it('puts expensive debt first', () => {
    const d = diagnoseWealth(
      [
        asset({ category: 'cash', name: 'Colchón', value: 20000, metadata: { job: 'emergency' } }),
        asset({
          category: 'debt',
          name: 'Tarjeta',
          value: 3000,
          metadata: { debtType: 'tarjeta', interestRate: 22, monthlyPayment: 150 },
        }),
      ],
      2000,
      6
    )
    expect(d.verdict).toBe('weak')
    expect(d.actions[0]?.id).toBe('expensive_debt')
  })

  it('uses net real-estate yield in a solid verdict', () => {
    const d = diagnoseWealth(
      [
        asset({ category: 'cash', name: 'Colchón', value: 12000, metadata: { job: 'emergency' } }),
        asset({
          category: 'cash',
          name: 'Remunerada',
          value: 5000,
          metadata: { job: 'emergency', interestRate: 2 },
        }),
        asset({
          category: 'real_estate',
          name: 'Piso',
          value: 200000,
          source: 'finca',
          metadata: {
            propertyType: 'alquiler',
            status: 'alquilado',
            monthlyRent: 800,
            ttmNetCashflow: 7200,
            valueSource: 'mercado',
          },
        }),
      ],
      2000,
      6
    )
    expect(d.verdict).toBe('solid')
    expect(d.realEstate.netYieldPct).toBe(3.6)
    expect(d.cashflow.monthlyNetPassive).toBeGreaterThan(d.realEstate.monthlyNet)
    expect(d.headline).toMatch(/netos al año/)
    expect(d.mix.stance).toBe('rebalance_with_cash')
    expect(d.moves.some(m => m.stance === 'divest')).toBe(false)
  })

  it('does not sell brick when cash already covers a rent stop', () => {
    const d = diagnoseWealth(
      [
        asset({ category: 'cash', name: 'Caja', value: 400000 }),
        asset({
          category: 'real_estate',
          name: 'Piso',
          value: 1500000,
          metadata: {
            propertyType: 'alquiler',
            status: 'alquilado',
            monthlyRent: 800,
            ttmNetCashflow: 6000,
            valueSource: 'mercado',
          },
        }),
        asset({
          category: 'real_estate',
          name: 'Vacío',
          value: 100000,
          metadata: { propertyType: 'alquiler', status: 'vacio', valueSource: 'mercado' },
        }),
      ],
      2000,
      6
    )
    expect(d.mix.realEstatePct).toBeGreaterThan(70)
    expect(d.mix.shockMonths).toBeGreaterThan(12)
    expect(d.mix.stance).toBe('rebalance_with_cash')
    expect(d.moves.some(m => m.stance === 'divest')).toBe(false)
    expect(d.moves.some(m => m.id === 'deploy_idle')).toBe(true)
    expect(d.moves.find(m => m.id === 'vacant_re')?.detail).toMatch(/fondos/)
  })

  it('recommends selling vacant brick when a rent stop would break the cash', () => {
    const d = diagnoseWealth(
      [
        asset({ category: 'cash', name: 'Caja', value: 8000 }),
        asset({
          category: 'real_estate',
          name: 'Alquilado',
          value: 180000,
          metadata: {
            propertyType: 'alquiler',
            status: 'alquilado',
            monthlyRent: 700,
            ttmNetCashflow: 5000,
            valueSource: 'mercado',
          },
        }),
        asset({
          category: 'real_estate',
          name: 'Vacío 1',
          value: 90000,
          metadata: { propertyType: 'alquiler', status: 'vacio', valueSource: 'mercado' },
        }),
        asset({
          category: 'real_estate',
          name: 'Vacío 2',
          value: 80000,
          metadata: { propertyType: 'alquiler', status: 'vacio', valueSource: 'mercado' },
        }),
      ],
      2000,
      6
    )
    expect(d.mix.stance).toBe('divest_brick')
    expect(d.mix.shockMonths).toBe(4)
    expect(d.moves.some(m => m.id === 'deploy_idle')).toBe(false)
    expect(d.moves.some(m => m.id === 'divest_vacant' && m.stance === 'divest')).toBe(true)
  })
})
