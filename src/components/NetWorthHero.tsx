import type { Asset, WealthSnapshot } from '../types'
import { formatEur, getNetWorth, getTotalDebts, getTotalPositiveAssets } from '../utils/calculations'
import { WealthChart } from './WealthChart'

export function NetWorthHero({
  assets,
  snapshots,
}: {
  assets: Asset[]
  snapshots?: WealthSnapshot[]
}) {
  const net = getNetWorth(assets)
  const assetsTotal = getTotalPositiveAssets(assets)
  const debts = getTotalDebts(assets)
  const prev = snapshots && snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
  const delta = prev != null ? net - prev.netWorth : null

  return (
    <section className="mb-4 pt-1">
      <p className="text-label font-body text-on-surface/50 mb-1">Patrimonio neto</p>
      <p className="font-display font-bold text-on-surface tabular-nums leading-none" style={{ fontSize: '2.25rem' }}>
        {formatEur(net)}
      </p>
      {delta != null && delta !== 0 && (
        <p className={`text-label font-body mt-1.5 tabular-nums ${delta > 0 ? 'text-primary' : 'text-error'}`}>
          {delta > 0 ? '↑' : '↓'} {formatEur(Math.abs(delta))} este mes
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <p className="text-label-sm text-on-surface/45 font-body">Activos</p>
          <p className="text-body font-semibold font-display tabular-nums text-on-surface">{formatEur(assetsTotal, true)}</p>
        </div>
        <div>
          <p className="text-label-sm text-on-surface/45 font-body">Deudas</p>
          <p className={`text-body font-semibold font-display tabular-nums ${debts > 0 ? 'text-error' : 'text-on-surface/40'}`}>
            {debts > 0 ? formatEur(debts, true) : '—'}
          </p>
        </div>
      </div>
      {snapshots && snapshots.length > 1 && (
        <div className="mt-3">
          <WealthChart snapshots={snapshots} />
        </div>
      )}
    </section>
  )
}
