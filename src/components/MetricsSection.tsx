import { TrendingUp } from 'lucide-react'
import type { Asset } from '../types'
import {
  getEmergencyFundMonths,
  getDebtRatio,
  getDiversificationWarning,
  getTotalMonthlyDebtPayments,
  formatMonths,
  formatEur,
} from '../utils/calculations'

interface MetricsSectionProps {
  assets: Asset[]
  monthlyExpenses: number
  onInsightsTap?: () => void
}

function MetricCard({ label, value, sub, highlight }: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
      <dl>
        <dt className="text-label text-on-surface/60 font-body mb-1">{label}</dt>
        <dd
          className={`text-headline font-display font-semibold ${highlight ? 'text-primary' : 'text-on-surface'}`}
        >
          {value}
        </dd>
        {sub && <dd className="text-label-sm text-on-surface/50 font-body mt-0.5">{sub}</dd>}
      </dl>
    </div>
  )
}

export function MetricsSection({ assets, monthlyExpenses, onInsightsTap }: MetricsSectionProps) {
  const emergencyMonths = getEmergencyFundMonths(assets, monthlyExpenses)
  const debtRatio = getDebtRatio(assets)
  const warning = getDiversificationWarning(assets)
  const monthlyDebtPayments = getTotalMonthlyDebtPayments(assets)

  const hasExpenses = monthlyExpenses > 0

  function debtRatioSub(ratio: number): string {
    if (ratio === 0) return 'Excelente posición'
    if (ratio < 0.2) return 'Buena posición'
    if (ratio < 0.4) return 'Controlable'
    if (ratio < 0.6) return 'Prioriza reducirla'
    return 'Situación crítica'
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-on-surface/40" />
          <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide">
            Indicadores
          </h3>
        </div>
        {onInsightsTap && (
          <button
            onClick={onInsightsTap}
            className="text-label-sm text-primary font-body font-medium"
          >
            Ver análisis →
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {hasExpenses ? (
          <MetricCard
            label="Colchón de emergencia"
            value={isFinite(emergencyMonths) ? `${formatMonths(emergencyMonths)} meses` : '—'}
            sub={
              !isFinite(emergencyMonths)
                ? 'Sin gastos configurados'
                : emergencyMonths < 3
                  ? 'Objetivo: 3 meses'
                  : emergencyMonths < 6
                    ? 'Bien, objetivo: 6 meses'
                    : 'Objetivo cumplido'
            }
            highlight={isFinite(emergencyMonths) && emergencyMonths >= 3}
          />
        ) : (
          <MetricCard
            label="Colchón de emergencia"
            value="—"
            sub="Configura tus gastos"
          />
        )}

        <MetricCard
          label="Ratio deuda/activos"
          value={debtRatio > 0 ? `${Math.round(debtRatio * 100)}%` : '0%'}
          sub={assets.length > 0 ? debtRatioSub(debtRatio) : 'Sin activos'}
          highlight={debtRatio < 0.2}
        />

        {monthlyDebtPayments > 0 && (
          <MetricCard
            label="Cuotas mensuales"
            value={formatEur(monthlyDebtPayments)}
            sub="Total comprometido en deuda"
          />
        )}
      </div>

      {warning && (
        <div className="mt-3 bg-primary-container/50 rounded-xl p-4">
          <p className="text-label text-on-surface/70 font-body leading-relaxed">
            ⚠️ {warning}
          </p>
        </div>
      )}
    </div>
  )
}
