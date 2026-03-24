import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AppData, WealthSnapshot } from '../../types'
import { shouldTakeSnapshot, takeSnapshot } from '../snapshots'

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
    const sameMonthDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const snapshots: WealthSnapshot[] = [
      { date: sameMonthDate, netWorth: 10000, liquidAssets: 5000 },
    ]
    expect(shouldTakeSnapshot(snapshots)).toBe(false)
  })

  it('returns true when last snapshot is in a previous month', () => {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const lastMonthDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
      .toISOString()
      .split('T')[0]
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
