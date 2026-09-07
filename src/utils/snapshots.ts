import type { AppData, WealthSnapshot } from '../types'
import { getNetWorth, getLiquidAssets } from './calculations'

function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function yearMonth(isoDate: string): { y: number; m: number } {
  const [y, m] = isoDate.split('-').map(Number)
  return { y, m }
}

export function shouldTakeSnapshot(snapshots: WealthSnapshot[]): boolean {
  if (snapshots.length === 0) return true
  const lastSnapshot = snapshots[snapshots.length - 1]
  const last = yearMonth(lastSnapshot.date)
  const now = new Date()
  return last.m !== now.getMonth() + 1 || last.y !== now.getFullYear()
}

export function takeSnapshot(data: AppData): AppData {
  if (!shouldTakeSnapshot(data.snapshots ?? [])) return data

  const today = new Date()
  const snapshotDate = localYmd(new Date(today.getFullYear(), today.getMonth(), 1))

  const newSnapshot: WealthSnapshot = {
    date: snapshotDate,
    netWorth: getNetWorth(data.assets),
    liquidAssets: getLiquidAssets(data.assets),
  }

  const snapshots = [...(data.snapshots ?? []), newSnapshot]
  // Keep last 24 months
  const trimmed = snapshots.slice(-24)

  return { ...data, snapshots: trimmed }
}
