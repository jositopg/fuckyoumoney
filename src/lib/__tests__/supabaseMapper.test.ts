import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Asset } from '../../types'
import {
  dbAssetToLocal,
  dbLiabilityToLocal,
  localAssetToDbInsert,
  localDebtToLiabilityInsert,
  mapDebtType,
  mergeCloudAndLocal,
  mergeCloudWithLocalRealEstate,
  prepareMigrationPayload,
  reverseDebtType,
} from '../supabaseMapper'
import {
  formatCloudError,
  hasMigrationFlag,
  MIGRATION_FLAG_KEY,
  setMigrationFlag,
} from '../supabaseData'
import type { AssetRow, LiabilityRow } from '../../types/database'

const USER = '11111111-1111-4111-8111-111111111111'

function baseAsset(partial: Partial<Asset> & Pick<Asset, 'category' | 'name' | 'value'>): Asset {
  return {
    id: partial.id ?? 'local-1',
    category: partial.category,
    name: partial.name,
    value: partial.value,
    symbol: partial.symbol,
    notes: partial.notes,
    metadata: partial.metadata,
    source: partial.source,
    readOnly: partial.readOnly,
    createdAt: partial.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2024-01-02T00:00:00.000Z',
  }
}

describe('supabaseMapper local → DB', () => {
  it('maps cash to type=cash with manual_value and quantity 1', () => {
    const row = localAssetToDbInsert(
      baseAsset({ category: 'cash', name: 'Cuenta', value: 2500 }),
      USER,
      '22222222-2222-4222-8222-222222222222'
    )
    expect(row).toMatchObject({
      type: 'cash',
      quantity: 1,
      manual_value: 2500,
      is_liquid: true,
      user_id: USER,
      institution: null,
    })
  })

  it('packs cash job, TAE and parked reason into notes', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        category: 'cash',
        name: 'Reserva',
        value: 8000,
        notes: 'hacienda',
        metadata: { job: 'parked', parkedReason: 'impuestos 2026', interestRate: 1.5 },
      }),
      USER,
      '22222222-2222-4222-8222-222222222224'
    )
    expect(row?.notes).toContain('FYM1:')
    expect(row?.notes).toContain('parked')
    expect(row?.notes).toContain('impuestos 2026')
  })

  it('maps cash accountType to institution', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        category: 'cash',
        name: 'BBVA',
        value: 1000,
        metadata: { accountType: 'corriente' },
      }),
      USER,
      '22222222-2222-4222-8222-222222222223'
    )
    expect(row).toMatchObject({
      type: 'cash',
      name: 'BBVA',
      institution: 'corriente',
      manual_value: 1000,
    })
  })

  it('maps stocks accion→stock with yahoo ticker', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        category: 'stocks',
        name: 'Apple',
        value: 1000,
        symbol: 'AAPL',
        metadata: { assetType: 'accion', quantity: 10, purchasePrice: 100 },
      }),
      USER,
      '33333333-3333-4333-8333-333333333333'
    )
    expect(row).toMatchObject({
      type: 'stock',
      ticker: 'AAPL',
      ticker_source: 'yahoo',
      quantity: 10,
      purchase_price: 100,
      manual_value: 1000,
    })
  })

  it('maps etf and fondo_indexado to etf', () => {
    const etf = localAssetToDbInsert(
      baseAsset({
        category: 'stocks',
        name: 'VWCE',
        value: 500,
        symbol: 'VWCE.DE',
        metadata: { assetType: 'etf', quantity: 5 },
      }),
      USER,
      '44444444-4444-4444-8444-444444444444'
    )
    expect(etf?.type).toBe('etf')

    const fondo = localAssetToDbInsert(
      baseAsset({
        category: 'stocks',
        name: 'Fondo',
        value: 500,
        metadata: { assetType: 'fondo_indexado', quantity: 5, canAutoUpdate: false },
      }),
      USER,
      '55555555-5555-4555-8555-555555555555'
    )
    expect(fondo?.type).toBe('etf')
    expect(fondo?.manual_value).toBe(500)
  })

  it('defaults a fund without assetType to etf, not other', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        category: 'stocks',
        name: 'VWCE',
        value: 10000,
        symbol: 'VWCE.DE',
      }),
      USER,
      '44444444-4444-4444-8444-444444444445'
    )
    expect(row?.type).toBe('etf')
    expect(row?.ticker).toBe('VWCE.DE')
  })

  it('maps crypto with coingecko source', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        category: 'crypto',
        name: 'BTC',
        value: 20000,
        symbol: 'bitcoin',
        metadata: { quantity: 0.5, purchasePrice: 30000 },
      }),
      USER,
      '66666666-6666-4666-8666-666666666666'
    )
    expect(row).toMatchObject({
      type: 'crypto',
      ticker: 'bitcoin',
      ticker_source: 'coingecko',
      quantity: 0.5,
    })
  })

  it('maps pension with institution from manager', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        category: 'pension',
        name: 'PIAS',
        value: 8000,
        metadata: { manager: 'Indexa' },
      }),
      USER,
      '77777777-7777-4777-8777-777777777777'
    )
    expect(row).toMatchObject({
      type: 'pension',
      manual_value: 8000,
      institution: 'Indexa',
    })
  })

  it('maps vehicles to type=other with notes meta', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        category: 'vehicles',
        name: 'Coche',
        value: 9000,
        notes: 'Seat',
        metadata: { vehicleType: 'coche', year: 2018 },
      }),
      USER,
      '88888888-8888-4888-8888-888888888888'
    )
    expect(row?.type).toBe('vehicle')
    expect(row?.manual_value).toBe(9000)
    expect(row?.notes).toContain('tipo:coche')
    expect(row?.notes).toContain('año:2018')
  })

  it('maps real_estate to type=real_estate with packed notes', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        category: 'real_estate',
        name: 'Piso',
        value: 200000,
        source: 'finca',
        readOnly: true,
        metadata: { propertyType: 'alquiler', monthlyRent: 750, fincaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      }),
      USER,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
    expect(row).toMatchObject({
      type: 'real_estate',
      manual_value: 200000,
      institution: 'finca',
      is_liquid: false,
    })
    expect(row?.notes).toContain('FYM1:')
  })

  it('maps debt to liabilities with debtType mapping', () => {
    expect(mapDebtType('hipoteca')).toBe('mortgage')
    expect(mapDebtType('tarjeta')).toBe('credit_card')
    const row = localDebtToLiabilityInsert(
      baseAsset({
        category: 'debt',
        name: 'Hipoteca',
        value: 120000,
        metadata: {
          debtType: 'hipoteca',
          interestRate: 2.5,
          monthlyPayment: 700,
          dueDate: '2040-01-01',
        },
      }),
      USER,
      '99999999-9999-4999-8999-999999999999'
    )
    expect(row).toMatchObject({
      type: 'mortgage',
      balance: 120000,
      interest_rate: 2.5,
      monthly_payment: 700,
      end_date: '2040-01-01',
    })
  })
})

describe('supabaseMapper DB → local', () => {
  it('converts asset rows back to UI Asset model', () => {
    const row: AssetRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      user_id: USER,
      name: 'Cash',
      type: 'cash',
      ticker: null,
      ticker_source: null,
      quantity: 1,
      purchase_price: null,
      purchase_date: null,
      manual_value: 1500,
      currency: 'EUR',
      institution: null,
      country: null,
      notes: null,
      is_liquid: true,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    }
    const asset = dbAssetToLocal(row)
    expect(asset.category).toBe('cash')
    expect(asset.value).toBe(1500)
    expect(asset.id).toBe(row.id)
  })

  it('maps cash institution back to accountType', () => {
    const row: AssetRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      user_id: USER,
      name: 'BBVA',
      type: 'cash',
      ticker: null,
      ticker_source: null,
      quantity: 1,
      purchase_price: null,
      purchase_date: null,
      manual_value: 1000,
      currency: 'EUR',
      institution: 'corriente',
      country: null,
      notes: null,
      is_liquid: true,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }
    const asset = dbAssetToLocal(row)
    expect(asset.category).toBe('cash')
    expect(asset.metadata).toMatchObject({ accountType: 'corriente' })
  })

  it('reads a fund saved as type=other (legacy) back as stocks', () => {
    const row: AssetRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae',
      user_id: USER,
      name: 'VWCE',
      type: 'other',
      ticker: 'VWCE.DE',
      ticker_source: 'yahoo',
      quantity: 10,
      purchase_price: null,
      purchase_date: null,
      manual_value: 12000,
      currency: 'EUR',
      institution: null,
      country: null,
      notes: null,
      is_liquid: true,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }
    const asset = dbAssetToLocal(row)
    expect(asset.category).toBe('stocks')
    expect(asset.symbol).toBe('VWCE.DE')
    expect(asset.value).toBe(12000)
  })

  it('classifies a fund by name even without ticker', () => {
    const row = localAssetToDbInsert(
      baseAsset({
        category: 'other',
        name: 'ETFs ProyectoK 8/10 Inbestme',
        value: 20100,
      }),
      USER,
      '44444444-4444-4444-8444-444444444446'
    )
    expect(row?.type).toBe('etf')
    expect(row?.institution).toBe('Inbestme')
  })

  it('unpacks cash job and TAE from packed notes', () => {
    const row: AssetRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
      user_id: USER,
      name: 'Reserva',
      type: 'cash',
      ticker: null,
      ticker_source: null,
      quantity: 1,
      purchase_price: null,
      purchase_date: null,
      manual_value: 8000,
      currency: 'EUR',
      institution: 'ahorro',
      country: null,
      notes: 'FYM1:{"job":"parked","parkedReason":"impuestos","interestRate":1.5,"human":"hacienda"}',
      is_liquid: true,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }
    const asset = dbAssetToLocal(row)
    expect(asset.notes).toBe('hacienda')
    expect(asset.metadata).toMatchObject({
      accountType: 'ahorro',
      job: 'parked',
      parkedReason: 'impuestos',
      interestRate: 1.5,
    })
  })

  it('converts real_estate row to read-only finca asset, not vehicles', () => {
    const row: AssetRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      user_id: USER,
      name: 'Piso Finca',
      type: 'real_estate',
      ticker: null,
      ticker_source: null,
      quantity: 1,
      purchase_price: null,
      purchase_date: null,
      manual_value: 180000,
      currency: 'EUR',
      institution: 'finca',
      country: 'Las Palmas',
      notes: 'FYM1:{"source":"finca","monthlyRent":700,"propertyType":"alquiler"}',
      is_liquid: false,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    }
    const asset = dbAssetToLocal(row)
    expect(asset.category).toBe('real_estate')
    expect(asset.source).toBe('finca')
    expect(asset.readOnly).toBe(true)
    expect(asset.value).toBe(180000)
    expect((asset.metadata as { monthlyRent?: number }).monthlyRent).toBe(700)
  })

  it('converts liability to debt Asset', () => {
    const row: LiabilityRow = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      user_id: USER,
      name: 'Préstamo',
      type: 'personal_loan',
      balance: 3000,
      original_amount: null,
      interest_rate: 5,
      monthly_payment: 100,
      start_date: null,
      end_date: '2027-01-01',
      currency: 'EUR',
      institution: null,
      notes: null,
      is_current: true,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    }
    const asset = dbLiabilityToLocal(row)
    expect(asset.category).toBe('debt')
    expect(asset.value).toBe(3000)
    expect(reverseDebtType('personal_loan')).toBe('prestamo_personal')
    expect((asset.metadata as { debtType?: string }).debtType).toBe('prestamo_personal')
  })
})

describe('prepareMigrationPayload', () => {
  it('syncs manual real_estate and omits finca-sourced rows from local migration', () => {
    const assets: Asset[] = [
      baseAsset({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        category: 'cash',
        name: 'Cash',
        value: 100,
      }),
      baseAsset({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        category: 'debt',
        name: 'Debt',
        value: 50,
        metadata: { debtType: 'otro' },
      }),
      baseAsset({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        category: 'real_estate',
        name: 'Piso manual',
        value: 200000,
      }),
      baseAsset({
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        category: 'real_estate',
        name: 'Piso Finca',
        value: 180000,
        source: 'finca',
        readOnly: true,
      }),
    ]

    const first = prepareMigrationPayload(assets, USER)

    expect(first.omittedRealEstate).toHaveLength(1)
    expect(first.omittedRealEstate[0].name).toBe('Piso Finca')
    expect(first.assetInserts).toHaveLength(2)
    expect(first.liabilityInserts).toHaveLength(1)
    expect(first.assetInserts.map(r => r.type).sort()).toEqual(['cash', 'real_estate'])
    expect(first.assetInserts[0].id).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  })

  it('merges cloud assets with local-only real_estate', () => {
    const cloud = [baseAsset({ id: 'c1', category: 'cash', name: 'C', value: 1 })]
    const local = [
      baseAsset({ id: 'c1', category: 'cash', name: 'old', value: 9 }),
      baseAsset({ id: 're1', category: 'real_estate', name: 'Piso', value: 10 }),
    ]
    const merged = mergeCloudWithLocalRealEstate(cloud, local)
    expect(merged).toHaveLength(2)
    expect(merged.find(a => a.category === 'real_estate')?.name).toBe('Piso')
    expect(merged.find(a => a.category === 'cash')?.value).toBe(1)
  })

  it('keeps unsynced local investments when Finca is already in the cloud', () => {
    const cloud = [
      baseAsset({
        id: '11111111-1111-4111-8111-111111111111',
        category: 'cash',
        name: 'Vieja',
        value: 100,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      baseAsset({
        id: 'finca-1',
        category: 'real_estate',
        name: 'Piso Finca',
        value: 100,
        source: 'finca',
        readOnly: true,
      }),
    ]
    const local = [
      baseAsset({
        id: '11111111-1111-4111-8111-111111111111',
        category: 'cash',
        name: 'Vieja editada',
        value: 250,
        updatedAt: '2026-09-08T12:00:00.000Z',
      }),
      baseAsset({
        id: 'new-fund',
        category: 'stocks',
        name: 'VWCE',
        value: 8000,
        updatedAt: '2026-09-08T12:00:00.000Z',
      }),
    ]
    const { merged, toUpsert } = mergeCloudAndLocal(cloud, local)
    expect(merged.find(a => a.category === 'stocks')?.value).toBe(8000)
    expect(merged.find(a => a.id === cloud[0].id)?.value).toBe(250)
    expect(merged.find(a => a.source === 'finca')?.name).toBe('Piso Finca')
    expect(toUpsert.map(a => a.name).sort()).toEqual(['VWCE', 'Vieja editada'])
  })

  it('drops local real_estate once Finca is in the cloud', () => {
    const cloud = [
      baseAsset({ id: 'c1', category: 'cash', name: 'C', value: 1 }),
      baseAsset({
        id: 'finca-1',
        category: 'real_estate',
        name: 'Piso Finca',
        value: 100,
        source: 'finca',
        readOnly: true,
      }),
    ]
    const local = [
      baseAsset({ id: 're1', category: 'real_estate', name: 'Piso viejo', value: 10 }),
    ]
    const merged = mergeCloudWithLocalRealEstate(cloud, local)
    expect(merged.filter(a => a.category === 'real_estate')).toHaveLength(1)
    expect(merged.find(a => a.category === 'real_estate')?.name).toBe('Piso Finca')
  })
})

describe('migration flag idempotency', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('setMigrationFlag makes hasMigrationFlag true (skip re-migrate)', () => {
    expect(hasMigrationFlag()).toBe(false)
    setMigrationFlag()
    expect(hasMigrationFlag()).toBe(true)
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('1')
    setMigrationFlag()
    expect(hasMigrationFlag()).toBe(true)
  })
})

describe('formatCloudError', () => {
  it('joins supabase message and details', () => {
    expect(
      formatCloudError({
        message: 'new row violates check constraint "assets_type_check"',
        details: 'Failing row contains (vehicle)',
      })
    ).toContain('assets_type_check')
  })
})
