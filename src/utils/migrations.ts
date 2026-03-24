import type { AppData } from '../types'

const CURRENT_VERSION = 2

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateData(raw: any): AppData {
  if (!raw || typeof raw !== 'object') {
    return { assets: [], monthlyExpenses: 0, schema_version: CURRENT_VERSION }
  }

  // v0 → v1: add schema_version
  if (!raw.schema_version) {
    raw = {
      assets: Array.isArray(raw.assets) ? raw.assets : [],
      monthlyExpenses: typeof raw.monthlyExpenses === 'number' ? raw.monthlyExpenses : 0,
      lastPriceUpdate: raw.lastPriceUpdate,
      snapshots: raw.snapshots,
      schema_version: 1,
    }
  }

  // v1 → v2: metadata field added (no structural changes needed, just bump version)
  if (raw.schema_version === 1) {
    raw = { ...raw, schema_version: 2 }
  }

  return raw as AppData
}
