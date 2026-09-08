import type { Asset } from '../types'
import { CATEGORY_LABELS } from '../types'
import { formatEur, getTotalPositiveAssets } from '../utils/calculations'

const COLORS: Record<string, string> = {
  cash: '#466649',
  stocks: '#3a5a3e',
  crypto: '#7aa37d',
  commodities: '#d4a836',
  real_estate: '#6b8e9a',
  vehicles: '#abb4b5',
  pension: '#8a9a8b',
  business: '#5c6b73',
  receivable: '#8a9e7c',
  other: '#9aa3a4',
}

const ORDER = [
  'real_estate',
  'stocks',
  'cash',
  'pension',
  'crypto',
  'business',
  'commodities',
  'vehicles',
  'receivable',
  'other',
] as const

export function AllocationPanel({ assets }: { assets: Asset[] }) {
  const total = getTotalPositiveAssets(assets)
  if (total <= 0) return null

  const rows = ORDER.map(cat => ({
    cat,
    value: assets.filter(a => a.category === cat).reduce((s, a) => s + a.value, 0),
  })).filter(r => r.value > 0)

  const stops = rows.map((r, i) => {
    const start = rows.slice(0, i).reduce((s, x) => s + (x.value / total) * 100, 0)
    const end = start + (r.value / total) * 100
    return `${COLORS[r.cat]} ${start}% ${end}%`
  })

  return (
    <div className="mb-4 bg-surface-container-lowest rounded-xl p-4 shadow-soft">
      <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide mb-3">
        Asignación
      </h3>
      <div
        className="h-3 rounded-full overflow-hidden mb-3"
        style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
        role="img"
        aria-label="Asignación de activos"
      />
      <ul className="space-y-1.5">
        {rows.map(r => (
          <li key={r.cat} className="flex items-center justify-between text-label font-body">
            <span className="flex items-center gap-2 text-on-surface/70">
              <span className="w-2 h-2 rounded-full" style={{ background: COLORS[r.cat] }} />
              {CATEGORY_LABELS[r.cat]}
            </span>
            <span className="tabular-nums text-on-surface">
              {formatEur(r.value)}
              <span className="text-on-surface/40 ml-2">{Math.round((r.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
