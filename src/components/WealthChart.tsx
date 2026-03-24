import type { WealthSnapshot } from '../types'

interface WealthChartProps {
  snapshots: WealthSnapshot[]
}

export function WealthChart({ snapshots }: WealthChartProps) {
  if (snapshots.length < 2) return null

  const values = snapshots.map(s => s.netWorth)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const width = 300
  const height = 48
  const padding = 4

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2)
    const y = height - padding - ((v - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  const pathD = `M ${points.join(' L ')}`

  return (
    <div className="mt-4 opacity-60" aria-hidden="true">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${height}px` }}
      >
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        />
      </svg>
    </div>
  )
}
