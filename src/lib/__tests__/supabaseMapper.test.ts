import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Asset } from '../../types'
import {
  dbAssetToLocal,
  dbLiabilityToLocal,
  localAssetToDbInsert,
  localDebtToLiabilityInsert,
  mapDebtType,
  mergeCloudWithLocalRealEstate,
  prepareMigrationPayload,
  reverseDebtType,
} from '../supabaseMapper'
import {
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
      manual_value: null,
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
    expect(row?.type).toBe('other')
    expect(row?.manual_value).toBe(9000)
    expect(row?.notes).toContain('tipo:coche')
    expect(row?.notes).toContain('año:2018')
  })

  it('returns null for real_estate (omit from DB)', () => {
    const row = localAssetToDbInsert(
      baseAsset({ category: 'real_estate', name: 'Piso', value: 200000 }),
      USER
    )
    expect(row).toBeNull()
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
  it('omits real_estate and maps the rest idempotently by stable uuid when provided', () => {
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
        id: 'local-re',
        category: 'real_estate',
        name: 'Piso',
        value: 200000,
      }),
    ]

    const first = prepareMigrationPayload(assets, USER)
    const second = prepareMigrationPayload(assets, USER)

    expect(first.omittedRealEstate).toHaveLength(1)
    expect(first.assetInserts).toHaveLength(1)
    expect(first.liabilityInserts).toHaveLength(1)
    expect(first.assetInserts[0].id).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    expect(second.assetInserts[0].id).toBe(first.assetInserts[0].id)
    expect(second.liabilityInserts[0].id).toBe(first.liabilityInserts[0].id)
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
