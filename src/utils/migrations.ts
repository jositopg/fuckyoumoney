import type { AppData } from '../types'

const CURRENT_VERSION = 1

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateData(raw: any): AppData {
  if (!raw || typeof raw !== 'object') {
    return { assets: [], monthlyExpenses: 0, schema_version: CURRENT_VERSION }
  }

  // v0 → v1: add schema_version field (first ever migration)
  if (!raw.schema_version) {
    return {
      assets: Array.isArray(raw.assets) ? raw.assets : [],
      monthlyExpenses: typeof raw.monthlyExpenses === 'number' ? raw.monthlyExpenses : 0,
      lastPriceUpdate: raw.lastPriceUpdate,
      schema_version: CURRENT_VERSION,
    }
  }

  return raw as AppData
}
