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
    <section className="mb-6 pt-2">
      <p className="text-label font-body text-on-surface/50 mb-1">Patrimonio neto</p>
      <p className="font-display font-bold text-on-surface tabular-nums leading-none" style={{ fontSize: '2.25rem' }}>
        {formatEur(net)}
      </p>
      {delta != null && delta !== 0 && (
        <p className={`text-label font-body mt-2 tabular-nums ${delta > 0 ? 'text-primary' : 'text-error'}`}>
          {delta > 0 ? '↑' : '↓'} {formatEur(Math.abs(delta))} este mes
        </p>
      )}
      <p className="text-label-sm text-on-surface/45 font-body mt-2">
        {formatEur(assetsTotal)} en activos
        {debts > 0 ? ` · ${formatEur(debts)} en deudas` : ''}
      </p>
      {snapshots && snapshots.length > 1 && (
        <div className="mt-4">
          <WealthChart snapshots={snapshots} />
        </div>
      )}
    </section>
  )
}
