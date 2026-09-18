import type { Asset, CommodityMetadata, CryptoMetadata, StocksMetadata } from '../types'

export const CASH_STALE_DAYS = 30

/** Spanish amount: "1.234,56" or "1234". */
export function parseEur(raw: string): number {
  const s = raw.trim().replace(/€/g, '').trim()
  if (!s) return NaN
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'))
  return Number(s)
}

export function formatEurInput(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace('.', ',')
}

export function daysSince(iso: string, now = Date.now()): number {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / (1000 * 60 * 60 * 24)))
}

export function formatAsOf(iso: string, now = Date.now()): string {
  const days = daysSince(iso, now)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function isCashStale(asset: Asset, now = Date.now()): boolean {
  return asset.category === 'cash' && daysSince(asset.updatedAt, now) >= CASH_STALE_DAYS
}

/** The number you typed. Quantity, if any, only recalculates pricePerUnit. */
export function setAssetValue(asset: Asset, value: number, nowIso = new Date().toISOString()): Asset {
  let metadata = asset.metadata
  if (asset.category === 'stocks' || asset.category === 'crypto' || asset.category === 'commodities') {
    const meta = (metadata ?? {}) as StocksMetadata | CryptoMetadata | CommodityMetadata
    const quantity = meta.quantity
    if (quantity && quantity > 0) {
      metadata = { ...meta, pricePerUnit: value / quantity }
    }
  }
  return { ...asset, value, metadata, updatedAt: nowIso }
}
