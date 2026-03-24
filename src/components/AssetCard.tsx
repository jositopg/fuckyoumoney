import { ChevronRight } from 'lucide-react'
import type { Asset, AssetCategory } from '../types'
import { formatEur } from '../utils/calculations'

interface AssetCardProps {
  asset: Asset
  onClick: () => void
}

const CATEGORY_ICONS: Record<AssetCategory, string> = {
  cash: '🏦',
  stocks: '📈',
  crypto: '₿',
  real_estate: '🏠',
  vehicles: '🚗',
  pension: '🏖️',
  debt: '📉',
}

export function AssetCard({ asset, onClick }: AssetCardProps) {
  const isDebt = asset.category === 'debt'
  const displayValue = isDebt ? -Math.abs(asset.value) : asset.value

  return (
    <button
      onClick={onClick}
      aria-label={`${asset.name}, ${formatEur(displayValue)}`}
      className="w-full flex items-center gap-3 py-3 px-0 text-left group transition-all
        active:scale-[0.99]"
    >
      <div
        aria-hidden="true"
        className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center
        text-[1.1rem] flex-shrink-0 transition-colors group-hover:bg-surface-container-highest"
      >
        {CATEGORY_ICONS[asset.category]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-on-surface font-body truncate">{asset.name}</p>
        {asset.symbol && (
          <p className="text-label-sm text-on-surface/50 font-mono uppercase">{asset.symbol}</p>
        )}
        {asset.notes && !asset.symbol && (
          <p className="text-label-sm text-on-surface/50 font-body truncate">{asset.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={`text-body font-semibold font-body tabular-nums ${isDebt ? 'text-error' : 'text-on-surface'}`}>
          {formatEur(displayValue)}
        </span>
        <ChevronRight size={15} className="text-outline-variant group-hover:text-on-surface/40 transition-colors" />
      </div>
    </button>
  )
}
