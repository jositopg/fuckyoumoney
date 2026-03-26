import type { Asset, WealthSnapshot } from '../types'
import {
  getAutonomyMonths,
  getAutonomyLevel,
  getNetWorth,
  getDebtRatio,
  getContextualMessage,
  formatEur,
} from '../utils/calculations'
import { getDailyQuote } from '../utils/quotes'
import { WealthChart } from './WealthChart'

interface AutonomyHeroProps {
  assets: Asset[]
  monthlyExpenses: number
  snapshots?: WealthSnapshot[]
  onQuoteTap?: () => void
}

export function AutonomyHero({ assets, monthlyExpenses, snapshots, onQuoteTap }: AutonomyHeroProps) {
  const netWorth = getNetWorth(assets)
  const autonomyMonths = getAutonomyMonths(assets, monthlyExpenses)
  const level = getAutonomyLevel(autonomyMonths)
  const quote = getDailyQuote()

  const hasExpenses = monthlyExpenses > 0
  const hasAssets = assets.length > 0

  // Net worth delta vs previous snapshot
  const prevSnapshot = snapshots && snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
  const netWorthDelta = prevSnapshot !== null ? netWorth - prevSnapshot.netWorth : null
  const showDelta = netWorthDelta !== null && netWorthDelta !== 0

  // Contextual phrase based on current level
  const debtRatio = getDebtRatio(assets)
  const contextualMsg = hasAssets ? getContextualMessage(
    isFinite(autonomyMonths) ? autonomyMonths : 0,
    netWorth,
    debtRatio
  ) : null

  // Format autonomy display — shows days for small amounts
  function getAutonomyDisplay() {
    if (!hasExpenses) return null
    if (!isFinite(autonomyMonths) || autonomyMonths < 0) return null

    const months = autonomyMonths

    if (months < 1) {
      const days = Math.round(months * 30)
      if (days <= 0) return null
      return `${days} día${days !== 1 ? 's' : ''}`
    }
    if (months >= 12) {
      const years = Math.floor(months / 12)
      const rem = Math.round(months % 12)
      if (rem === 0) return `${years} año${years !== 1 ? 's' : ''}`
      return `${years} año${years !== 1 ? 's' : ''} y ${rem} mes${rem !== 1 ? 'es' : ''}`
    }
    const rounded = Math.round(months * 10) / 10
    return `${rounded} mes${rounded !== 1 ? 'es' : ''}`
  }

  const autonomyDisplay = getAutonomyDisplay()

  return (
    <div className="pt-6 pb-8">
      {/* Primary metric — autonomy */}
      <div className="mb-5">
        {hasExpenses && autonomyDisplay ? (
          <>
            <p className="text-label text-on-surface/50 font-body mb-2 uppercase tracking-wide font-medium">
              Puedes cubrir
            </p>
            <h1 className="font-display font-bold text-on-surface leading-none mb-1"
              style={{ fontSize: 'clamp(2.5rem, 10vw, 3.5rem)', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
              {autonomyDisplay}
            </h1>
            <p className="text-label text-on-surface/50 font-body mt-1">
              sin necesitar ingresos
            </p>
          </>
        ) : hasAssets ? (
          <>
            <p className="text-label text-on-surface/50 font-body mb-2 uppercase tracking-wide font-medium">
              Patrimonio
            </p>
            <h1 className="font-display font-bold text-on-surface leading-none"
              style={{ fontSize: 'clamp(2.5rem, 10vw, 3.5rem)', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
              {formatEur(netWorth)}
            </h1>
            {!hasExpenses && (
              <p className="text-label text-on-surface/40 font-body mt-2">
                Añade tus gastos mensuales para calcular tu autonomía
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-label text-on-surface/50 font-body mb-2 uppercase tracking-wide font-medium">
              Comienza aquí
            </p>
            <h1 className="font-display font-bold text-on-surface leading-none"
              style={{ fontSize: 'clamp(2rem, 8vw, 2.75rem)', letterSpacing: '-0.015em', lineHeight: '1.15' }}>
              Tu punto de partida
            </h1>
          </>
        )}
      </div>

      {/* Level badge + contextual phrase */}
      {hasAssets && (
        <div className="mb-5">
          <div className="inline-flex items-center gap-2 bg-primary-container/60 rounded-full px-3.5 py-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-label font-semibold text-primary font-body">{level.label}</span>
          </div>
          {contextualMsg && (
            <p className="text-label-sm text-on-surface/45 font-body leading-relaxed italic">
              {contextualMsg}
            </p>
          )}
        </div>
      )}

      {/* Net worth (secondary) + monthly delta */}
      {hasExpenses && hasAssets && (
        <div className="flex items-baseline gap-2 mb-5 flex-wrap">
          <span className="text-label text-on-surface/50 font-body">Patrimonio neto</span>
          <span className={`text-title font-display font-semibold tabular-nums ${netWorth < 0 ? 'text-error' : 'text-on-surface'}`}>
            {formatEur(netWorth)}
          </span>
          {showDelta && (
            <span className={`text-label-sm font-body font-medium tabular-nums ${netWorthDelta! > 0 ? 'text-primary' : 'text-error'}`}>
              {netWorthDelta! > 0 ? '↑' : '↓'} {formatEur(Math.abs(netWorthDelta!), true)} este mes
            </span>
          )}
        </div>
      )}

      {/* Daily quote */}
      <button
        onClick={onQuoteTap}
        className="w-full text-left bg-surface-container-lowest rounded-xl p-4 shadow-soft"
        disabled={!onQuoteTap}
      >
        <p className="text-body text-on-surface/70 font-body leading-relaxed italic">
          "{quote.text}"
        </p>
        {onQuoteTap && (
          <p className="text-label-sm text-on-surface/30 font-body mt-2">
            La filosofía →
          </p>
        )}
      </button>

      {/* Sparkline chart */}
      {snapshots && snapshots.length >= 2 && <WealthChart snapshots={snapshots} />}
    </div>
  )
}
