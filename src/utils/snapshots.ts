import type { AppData, WealthSnapshot } from '../types'
import { getNetWorth, getLiquidAssets } from './calculations'

export function shouldTakeSnapshot(snapshots: WealthSnapshot[]): boolean {
  if (snapshots.length === 0) return true
  const lastSnapshot = snapshots[snapshots.length - 1]
  const lastDate = new Date(lastSnapshot.date)
  const now = new Date()
  // Take snapshot if we're in a different month
  return lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear()
}

export function takeSnapshot(data: AppData): AppData {
  if (!shouldTakeSnapshot(data.snapshots ?? [])) return data

  const today = new Date()
  const snapshotDate = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0]

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
