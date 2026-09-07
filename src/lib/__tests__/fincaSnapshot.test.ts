import { describe, expect, it } from 'vitest'
import { fincaPropertyToAsset, snapshotToAssets, type FincaSnapshot } from '../fincaSnapshot'

const snap: FincaSnapshot = {
  source: 'finca',
  asOf: '2026-09-07T00:00:00.000Z',
  currency: 'EUR',
  scope: 'owner_share_only',
  gaps: ['no_mortgage_principal'],
  totals: {
    propertyCount: 2,
    grossMarketValue: 250000,
    cadastralValue: 0,
    valueCoverage: { withMarket: 1, withCadastralOnly: 0, missing: 1 },
    mortgageOutstanding: null,
    equity: 250000,
    monthlyContractedRent: 800,
    occupancy: { rented: 1, vacant: 0, renovation: 0, forSale: 0, ownerUse: 1, rate: 1 },
  },
  properties: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Piso A',
      type: 'piso',
      status: 'alquilado',
      ownershipPct: 100,
      grossValue: 200000,
      valueSource: 'mercado',
      ownerShareValue: 200000,
      monthlyContractedRent: 800,
      occupied: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Casa B',
      type: 'casa',
      status: 'vivienda_habitual',
      ownershipPct: 50,
      grossValue: 100000,
      valueSource: 'catastro',
      ownerShareValue: 50000,
      monthlyContractedRent: 0,
      occupied: false,
    },
  ],
}

describe('fincaSnapshot', () => {
  it('maps rented piso to read-only real_estate', () => {
    const a = fincaPropertyToAsset(snap.properties[0], snap.asOf)
    expect(a.category).toBe('real_estate')
    expect(a.source).toBe('finca')
    expect(a.readOnly).toBe(true)
    expect(a.value).toBe(200000)
    expect(a.metadata).toMatchObject({ monthlyRent: 800, propertyType: 'alquiler' })
  })

  it('maps vivienda habitual and ownership share', () => {
    const a = fincaPropertyToAsset(snap.properties[1], snap.asOf)
    expect(a.value).toBe(50000)
    expect(a.metadata).toMatchObject({ propertyType: 'vivienda_habitual', ownershipPct: 50 })
  })

  it('snapshotToAssets keeps finca ids', () => {
    const assets = snapshotToAssets(snap)
    expect(assets.map(a => a.id)).toEqual(snap.properties.map(p => p.id))
  })
})
