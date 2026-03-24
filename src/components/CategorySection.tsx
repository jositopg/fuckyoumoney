import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Asset, AssetCategory } from '../types'
import { CATEGORY_LABELS } from '../types'
import { AssetCard } from './AssetCard'
import { formatEur } from '../utils/calculations'

interface CategorySectionProps {
  category: AssetCategory
  assets: Asset[]
  onAssetClick: (asset: Asset) => void
}

export function CategorySection({ category, assets, onAssetClick }: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (assets.length === 0) return null

  const isDebt = category === 'debt'
  const total = assets.reduce((sum, a) => sum + a.value, 0)
  const displayTotal = isDebt ? -total : total

  return (
    <div className="mb-2">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between py-2 group"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-label font-semibold text-on-surface/60 font-body uppercase tracking-wide">
            {CATEGORY_LABELS[category]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-label font-semibold font-body tabular-nums ${isDebt ? 'text-error' : 'text-on-surface/70'}`}>
            {formatEur(displayTotal)}
          </span>
          <ChevronRight
            size={14}
            className={`text-outline-variant transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
          />
        </div>
      </button>

      {/* Assets list */}
      {!collapsed && (
        <div className="bg-surface-container-lowest rounded-xl shadow-soft px-4 divide-y divide-surface-container-low">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onClick={() => onAssetClick(asset)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
