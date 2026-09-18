import type { Asset, CommodityMetadata, CryptoMetadata, StocksMetadata } from '../types'

export interface PriceMaps {
  values: Map<string, number>
  resolvedTickers: Map<string, string>
}

/** Apply fetched prices onto assets. Same array reference if nothing changed. */
export function applyPriceResult(
  assets: Asset[],
  { values, resolvedTickers }: PriceMaps,
  nowIso = new Date().toISOString()
): { assets: Asset[]; changed: Asset[] } {
  if (values.size === 0 && resolvedTickers.size === 0) {
    return { assets, changed: [] }
  }

  const changed: Asset[] = []
  const next = assets.map(a => {
    const newValue = values.get(a.id)
    const newResolvedTicker = resolvedTickers.get(a.id)
    if (newValue === undefined && !newResolvedTicker) return a

    let updatedMetadata = a.metadata
    if (a.category === 'stocks' || a.category === 'crypto' || a.category === 'commodities') {
      const meta = a.metadata as StocksMetadata | CryptoMetadata | CommodityMetadata | undefined
      const quantity = meta?.quantity
      const newPricePerUnit =
        quantity && quantity > 0 && newValue !== undefined ? newValue / quantity : undefined
      updatedMetadata = {
        ...meta,
        ...(newPricePerUnit !== undefined && { pricePerUnit: newPricePerUnit }),
        ...(newResolvedTicker && { resolvedTicker: newResolvedTicker }),
      }
    }

    const updated: Asset = {
      ...a,
      ...(newValue !== undefined && { value: newValue }),
      metadata: updatedMetadata,
      updatedAt: nowIso,
    }
    changed.push(updated)
    return updated
  })

  return { assets: next, changed }
}

export function assetsDiffer(before: Asset[], after: Asset[]): Asset[] {
  const prev = new Map(before.map(a => [a.id, a]))
  return after.filter(a => {
    const old = prev.get(a.id)
    return !old || old.value !== a.value || old.updatedAt !== a.updatedAt || old.metadata !== a.metadata
  })
}
