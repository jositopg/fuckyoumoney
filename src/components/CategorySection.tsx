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
  onReview?: () => void
  hint?: string
}

export function CategorySection({
  category,
  assets,
  onAssetClick,
  onReview,
  hint,
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (assets.length === 0) return null

  const isDebt = category === 'debt'
  const total = assets.reduce((sum, a) => sum + a.value, 0)
  const displayTotal = isDebt ? -total : total

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          className="flex-1 flex items-center justify-between group min-w-0"
        >
          <span className="text-label font-semibold text-on-surface/60 font-body uppercase tracking-wide">
            {CATEGORY_LABELS[category]}
          </span>
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
        {onReview && (
          <button
            type="button"
            onClick={onReview}
            className="flex-shrink-0 text-label-sm font-medium text-primary font-body px-2 py-1"
          >
            Saldos
          </button>
        )}
      </div>
      {hint && !collapsed && (
        <p className="text-label-sm text-on-surface/40 font-body -mt-1 mb-2">{hint}</p>
      )}

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
