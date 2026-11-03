import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AppData, WealthSnapshot } from '../../types'
import { evolucionDe, fechaMadrid, netoDiario, serieParaGrafico, shouldTakeSnapshot, takeSnapshot } from '../snapshots'

function makeAppData(overrides: Partial<AppData> = {}): AppData {
  return {
    assets: [],
    monthlyExpenses: 0,
    schema_version: 1,
    ...overrides,
  }
}

describe('shouldTakeSnapshot', () => {
  it('returns true when snapshots array is empty', () => {
    expect(shouldTakeSnapshot([])).toBe(true)
  })

  it('returns false when last snapshot is in the same month', () => {
    const now = new Date()
    const sameMonthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const snapshots: WealthSnapshot[] = [
      { date: sameMonthDate, netWorth: 10000, liquidAssets: 5000 },
    ]
    expect(shouldTakeSnapshot(snapshots)).toBe(false)
  })

  it('returns true when last snapshot is in a previous month', () => {
    const lastMonth = new Date()
    lastMonth.setDate(1)
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const lastMonthDate = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`
    const snapshots: WealthSnapshot[] = [
      { date: lastMonthDate, netWorth: 10000, liquidAssets: 5000 },
    ]
    expect(shouldTakeSnapshot(snapshots)).toBe(true)
  })

  it('returns true when last snapshot is in a previous year', () => {
    const snapshots: WealthSnapshot[] = [
      { date: '2020-01-01', netWorth: 5000, liquidAssets: 2000 },
    ]
    expect(shouldTakeSnapshot(snapshots)).toBe(true)
  })
})

describe('takeSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-03-15'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds a snapshot when none exist', () => {
    const data = makeAppData()
    const result = takeSnapshot(data)
    expect(result.snapshots).toHaveLength(1)
    expect(result.snapshots![0].date).toBe('2024-03-01')
  })

  it('does not add a snapshot when one already exists for current month', () => {
    const data = makeAppData({
      snapshots: [{ date: '2024-03-01', netWorth: 10000, liquidAssets: 5000 }],
    })
    const result = takeSnapshot(data)
    expect(result.snapshots).toHaveLength(1)
  })

  it('adds a snapshot when last snapshot is from previous month', () => {
    const data = makeAppData({
      snapshots: [{ date: '2024-02-01', netWorth: 8000, liquidAssets: 4000 }],
    })
    const result = takeSnapshot(data)
    expect(result.snapshots).toHaveLength(2)
    expect(result.snapshots![1].date).toBe('2024-03-01')
  })

  it('trims snapshots to last 24', () => {
    const manySnapshots: WealthSnapshot[] = Array.from({ length: 25 }, (_, i) => ({
      date: `2022-${String(i + 1).padStart(2, '0')}-01`,
      netWorth: 1000 * (i + 1),
      liquidAssets: 500 * (i + 1),
    }))
    // Make last snapshot old so a new one will be taken
    manySnapshots[manySnapshots.length - 1].date = '2023-01-01'
    const data = makeAppData({ snapshots: manySnapshots })
    const result = takeSnapshot(data)
    expect(result.snapshots!.length).toBeLessThanOrEqual(24)
  })

  it('snapshot includes correct netWorth from assets', () => {
    const data = makeAppData({
      assets: [
        {
          id: '1',
          category: 'cash',
          name: 'Savings',
          value: 5000,
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
    const result = takeSnapshot(data)
    expect(result.snapshots![0].netWorth).toBe(5000)
  })

  it('snapshot includes correct liquidAssets', () => {
    const data = makeAppData({
      assets: [
        {
          id: '1',
          category: 'cash',
          name: 'Cash',
          value: 2000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '2',
          category: 'real_estate',
          name: 'House',
          value: 300000,
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
    const result = takeSnapshot(data)
    expect(result.snapshots![0].liquidAssets).toBe(2000)
  })

  it('returns same data reference when no snapshot needed', () => {
    const data = makeAppData({
      snapshots: [{ date: '2024-03-01', netWorth: 10000, liquidAssets: 5000 }],
    })
    const result = takeSnapshot(data)
    expect(result).toBe(data)
  })
})

describe('evolución en porcentaje', () => {
  it('arrastra el último valor cuando faltan días', () => {
    const puntos = [
      { fecha: '2026-01-01', valor: 100 },
      { fecha: '2026-01-10', valor: 150 },
    ]
    const evo = evolucionDe(puntos, { hasta: '2026-01-10' })
    expect(evo.variacion['1d']).toMatchObject({ desde: '2026-01-09', base: 100, actual: 150, porcentaje: 50 })

    const recortada = evolucionDe(puntos, { desde: '2026-01-05', hasta: '2026-01-10' })
    expect(recortada.serie.map((punto) => punto.fecha)).toEqual(['2026-01-10'])
    expect(recortada.variacion['1d'].base).toBe(100)
    expect(recortada.variacion['1d'].porcentaje).toBe(50)
  })

  it('no divide por cero', () => {
    const evo = evolucionDe(
      [
        { fecha: '2026-01-01', valor: 0 },
        { fecha: '2026-01-02', valor: 10 },
      ],
      { hasta: '2026-01-02' },
    )
    expect(evo.variacion['1d'].base).toBe(0)
    expect(evo.variacion['1d'].porcentaje).toBeNull()
    expect(evo.variacion['1d'].actual).toBe(10)
  })

  it('una posición creada a mitad de periodo no inventa una base', () => {
    const evo = evolucionDe(
      [
        { fecha: '2026-06-15', valor: 100 },
        { fecha: '2026-06-20', valor: 110 },
      ],
      { hasta: '2026-06-20' },
    )
    expect(evo.serie[0].fecha).toBe('2026-06-15')
    expect(evo.variacion['1d']).toMatchObject({ desde: '2026-06-19', base: 100, actual: 110, porcentaje: 10 })
    expect(evo.variacion['30d'].porcentaje).toBeNull()
    expect(evo.variacion.ytd.porcentaje).toBeNull()
    expect(evo.variacion['12m'].porcentaje).toBeNull()
    expect(evo.variacion['12m'].desde).toBe('2025-06-20')
  })

  it('el mismo día se queda con el último valor y no duplica', () => {
    const evo = evolucionDe(
      [
        { fecha: '2026-01-01', valor: 100 },
        { fecha: '2026-01-01', valor: 80 },
      ],
      { hasta: '2026-01-01' },
    )
    expect(evo.serie).toEqual([{ fecha: '2026-01-01', valor: 80 }])
    expect(evo.variacion['1d'].porcentaje).toBeNull()
    expect(serieParaGrafico([
      { fecha: '2026-01-01', valor: 100 },
      { fecha: '2026-01-01', valor: 80 },
    ])).toEqual([{ date: '2026-01-01', value: 80 }])
  })

  it('el 29 de febrero mira el 28 del año anterior', () => {
    const evo = evolucionDe(
      [
        { fecha: '2023-02-28', valor: 100 },
        { fecha: '2024-02-29', valor: 110 },
      ],
      { hasta: '2024-02-29' },
    )
    expect(evo.variacion['12m'].desde).toBe('2023-02-28')
    expect(evo.variacion['12m'].porcentaje).toBe(10)
  })

  it('la fecha de la foto es el día en Madrid', () => {
    expect(fechaMadrid(new Date('2026-01-15T23:30:00.000Z'))).toBe('2026-01-16')
  })

  it('el neto no cuenta como cero una posición que todavía no existe', () => {
    const serie = netoDiario(
      [
        { position_id: 'a', kind: 'asset', fecha: '2026-01-01', valor: 100 },
        { position_id: 'a', kind: 'asset', fecha: '2026-01-10', valor: 150 },
        { position_id: 'b', kind: 'liability', fecha: '2026-01-10', valor: 40 },
      ],
      '2026-01-10',
    )
    const evo = evolucionDe(serie, { hasta: '2026-01-10' })
    expect(evo.serie).toEqual([
      { fecha: '2026-01-01', valor: 100 },
      { fecha: '2026-01-10', valor: 110 },
    ])
    expect(evo.variacion['1d']).toMatchObject({ base: 100, actual: 110, porcentaje: 10 })
  })
})
