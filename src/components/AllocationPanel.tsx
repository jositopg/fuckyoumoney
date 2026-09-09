import { formatEur } from '../utils/calculations'
import {
  LANDLORD_BANDS,
  type MixAnalysis,
  type MixSleeve,
  type MixTarget,
} from '../utils/moneyDiagnosis'

const SLEEVE_COLOR: Record<MixSleeve['id'], string> = {
  real_estate: '#6b8e9a',
  home: '#8aa4ad',
  invested: '#466649',
  cash: '#d4a836',
  parked: '#abb4b5',
  rest: '#9aa3a4',
}

function Donut({ sleeves }: { sleeves: MixSleeve[] }) {
  const slices = sleeves.filter(s => s.currentPct > 0)
  const r = 16
  const c = 2 * Math.PI * r
  let offset = 0
  const parts = slices.map(s => {
    const len = (s.currentPct / 100) * c
    const dash = `${len} ${c - len}`
    const el = (
      <circle
        key={s.id}
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={SLEEVE_COLOR[s.id]}
        strokeWidth="6"
        strokeDasharray={dash}
        strokeDashoffset={-offset}
        transform="rotate(-90 20 20)"
      />
    )
    offset += len
    return el
  })

  return (
    <svg viewBox="0 0 40 40" className="w-16 h-16 flex-shrink-0" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#f1f4f4" strokeWidth="6" />
      {parts}
    </svg>
  )
}

function BandBar({ sleeve }: { sleeve: MixSleeve }) {
  const pct = Math.min(Math.max(sleeve.currentPct, 0), 100)
  const band = sleeve.band
  const over = sleeve.deltaPts > 0
  const under = sleeve.deltaPts < 0

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-label font-body text-on-surface/70">{sleeve.label}</span>
        <span className="text-label font-semibold font-body tabular-nums text-on-surface">
          {sleeve.currentPct}%
          {band && (
            <span className="font-normal text-on-surface/40"> · {band.min}–{band.max}</span>
          )}
          {over && (
            <span className="text-error font-medium ml-1.5">+{sleeve.deltaPts}</span>
          )}
          {under && (
            <span className="text-error font-medium ml-1.5">{sleeve.deltaPts}</span>
          )}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-surface-container-low">
        {band && (
          <span
            className="absolute inset-y-0 rounded-sm bg-primary-container/80"
            style={{ left: `${band.min}%`, width: `${Math.max(band.max - band.min, 0)}%` }}
          />
        )}
        <span
          className="absolute left-0 top-1 bottom-1 rounded-full"
          style={{ width: `${pct}%`, background: SLEEVE_COLOR[sleeve.id] }}
        />
        <span
          className="absolute top-0.5 bottom-0.5 w-0.5 rounded-full bg-on-surface"
          style={{ left: `min(${pct}%, calc(100% - 2px))` }}
        />
      </div>
    </li>
  )
}

function bandCaption(target: MixTarget): string {
  const brick = target.profile === 'landlord' ? LANDLORD_BANDS.realEstate : { min: 0, max: 25 }
  const funds = target.profile === 'landlord' ? { min: 20, max: 35 } : { min: 60, max: 85 }
  return target.profile === 'landlord'
    ? `Alquiler ${brick.min}–${brick.max}% · fondos ${funds.min}–${funds.max}%`
    : `Fondos ${funds.min}–${funds.max}% · ladrillo ${brick.min}–${brick.max}%`
}

export function MixPanel({ mix }: { mix: MixAnalysis }) {
  if (mix.totalAssets <= 0) return null
  const { target } = mix
  const shown = target.sleeves.filter(s => s.current > 0 || s.band)
  const core = shown.filter(s => s.id === 'real_estate' || s.id === 'home' || s.id === 'invested')
  const extra = shown.filter(s => s.id === 'cash' || s.id === 'parked' || s.id === 'rest')

  return (
    <section className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
      <div className="flex items-center gap-3 mb-3">
        <Donut sleeves={target.sleeves} />
        <div className="min-w-0">
          <h3 className="text-label font-semibold text-on-surface font-body">Mezcla</h3>
          <p className="text-label-sm text-on-surface/50 font-body leading-snug">{bandCaption(target)}</p>
        </div>
      </div>

      <ul className="space-y-3 mb-3">
        {core.map(s => (
          <BandBar key={s.id} sleeve={s} />
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-label-sm font-body tabular-nums text-on-surface/55 mb-3">
        {extra.map(s => (
          <span key={s.id}>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
              style={{ background: SLEEVE_COLOR[s.id] }}
            />
            {s.label} {s.currentPct}%
          </span>
        ))}
      </div>

      <p className="text-label font-medium text-on-surface font-body leading-snug">{mix.line}</p>
      {target.fundsShortEur > 0 && mix.stance !== 'divest_brick' && (
        <p className="text-label-sm text-on-surface/50 font-body mt-1 tabular-nums">
          Para entrar en fondos: {formatEur(target.fundsShortEur, true)}
          {target.closableNow > 0 ? ` · ahora ${formatEur(target.closableNow, true)}` : ''}
          {target.brickOverEur > 0 ? ` · ladrillo de más ${formatEur(target.brickOverEur, true)}` : ''}
        </p>
      )}
    </section>
  )
}

/** @deprecated cover uses MixPanel; kept for any leftover import */
export function AllocationPanel({ mix }: { mix: MixAnalysis }) {
  return <MixPanel mix={mix} />
}
