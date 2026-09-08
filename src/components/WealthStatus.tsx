import type { Asset } from '../types'
import { CASH_JOB_LABELS } from '../types'
import { formatEur } from '../utils/calculations'
import {
  CAPITAL_STANCE_LABELS,
  diagnoseWealth,
  type CapitalMove,
  type DiagnosisQuestion,
  type MixAnalysis,
} from '../utils/moneyDiagnosis'

interface WealthStatusProps {
  assets: Asset[]
  monthlyExpenses: number
  emergencyTargetMonths?: number
  onAsk?: (question: DiagnosisQuestion) => void
}

const VERDICT_TONE: Record<string, string> = {
  unknown: 'bg-surface-container-low',
  weak: 'bg-error/10',
  ok: 'bg-surface-container-lowest shadow-soft',
  solid: 'bg-primary-container/30',
}

export function WealthStatus({
  assets,
  monthlyExpenses,
  emergencyTargetMonths,
  onAsk,
}: WealthStatusProps) {
  if (assets.length === 0) return null

  const d = diagnoseWealth(assets, monthlyExpenses, emergencyTargetMonths)
  const { buckets, realEstate: re, cashflow } = d
  const hasCash = buckets.unparked + buckets.parked > 0

  return (
    <div className="mb-6 space-y-3">
      <section className={`rounded-xl p-4 ${VERDICT_TONE[d.verdict]}`}>
        <p className="text-label-sm font-semibold text-on-surface/45 font-body uppercase tracking-wide mb-1">
          {d.verdict === 'unknown'
            ? 'Faltan datos'
            : d.verdict === 'weak'
              ? 'Ahora mismo'
              : d.verdict === 'ok'
                ? 'Bien, con matices'
                : 'En orden'}
        </p>
        <p className="text-body font-medium text-on-surface font-body leading-relaxed">{d.headline}</p>
        {d.cashflow.expenseCoverage != null && (
          <p className="text-label text-on-surface/55 font-body mt-2">
            {d.cashflow.expenseCoverage >= 1
              ? 'La renta neta cubre tus gastos. El patrimonio ya paga la vida.'
              : `La renta neta cubre el ${Math.round(d.cashflow.expenseCoverage * 100)}% de tus gastos.`}
          </p>
        )}
        {d.questions.length > 0 && (
          <div className="mt-3 space-y-2">
            {d.questions.map(q => (
              <button
                key={q.id}
                type="button"
                onClick={() => onAsk?.(q)}
                className="w-full text-left rounded-xl bg-surface/70 px-3 py-2.5
                  hover:bg-surface transition-colors"
              >
                <p className="text-label font-medium text-on-surface font-body">{q.prompt}</p>
                <p className="text-label-sm text-on-surface/50 font-body mt-0.5 leading-relaxed">{q.why}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {d.mix.totalAssets > 0 && <MixCard mix={d.mix} />}

      {d.moves.length > 0 && (
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
          <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide mb-3">
            Qué hacer
          </h3>
          <ul className="space-y-3">
            {d.moves.map(m => (
              <MoveRow key={m.id} move={m} />
            ))}
          </ul>
        </section>
      )}

      {hasCash && (
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
          <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide mb-3">
            Efectivo
          </h3>
          <ul className="space-y-2">
            <BucketRow
              label={CASH_JOB_LABELS.emergency}
              value={buckets.emergencyAssigned}
              hint={
                buckets.emergencyAssumed
                  ? 'sin asignar'
                  : cashflow.emergencyMonths != null
                    ? `${cashflow.emergencyMonths} meses`
                    : undefined
              }
              muted={buckets.emergencyAssumed}
            />
            <BucketRow
              label={CASH_JOB_LABELS.parked}
              value={buckets.parked}
              hint={buckets.parked > 0 ? 'con motivo' : undefined}
            />
            <BucketRow label={CASH_JOB_LABELS.working} value={buckets.working} hint="con TAE" />
            <BucketRow
              label={CASH_JOB_LABELS.idle}
              value={buckets.idle}
              hint={buckets.idle > 0 ? 'al 0%, sin motivo' : undefined}
              warn={buckets.idle > 0}
            />
          </ul>
        </section>
      )}

      {re.properties > 0 && (
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
          <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide mb-3">
            Inmuebles
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-label-sm text-on-surface/50 font-body">Valor</p>
              <p className="text-headline font-display font-semibold text-on-surface tabular-nums">
                {formatEur(re.value, true)}
              </p>
            </div>
            <div>
              <p className="text-label-sm text-on-surface/50 font-body">Neto 12 meses</p>
              <p
                className={`text-headline font-display font-semibold tabular-nums ${
                  re.ttmNetCashflow > 0 ? 'text-primary' : 'text-on-surface'
                }`}
              >
                {formatEur(Math.round(re.ttmNetCashflow), true)}
              </p>
            </div>
            <div>
              <p className="text-label-sm text-on-surface/50 font-body">Bruto contratado</p>
              <p className="text-body font-semibold text-on-surface font-body tabular-nums">
                {formatEur(re.monthlyGrossRent)}/mes
              </p>
            </div>
            <div>
              <p className="text-label-sm text-on-surface/50 font-body">Rentabilidad neta</p>
              <p className="text-body font-semibold text-on-surface font-body tabular-nums">
                {re.netYieldPct == null ? '—' : `${re.netYieldPct}%`}
              </p>
            </div>
          </div>
          {(re.vacant > 0 || re.habitualValue > 0) && (
            <p className="text-label-sm text-on-surface/45 font-body mt-3">
              {re.rented} alquilados
              {re.vacant > 0 ? ` · ${re.vacant} vacíos` : ''}
              {re.habitualValue > 0 ? ` · vivienda ${formatEur(re.habitualValue, true)}` : ''}
            </p>
          )}
        </section>
      )}
    </div>
  )
}

const STANCE_TONE: Record<string, string> = {
  leave: 'text-on-surface/50',
  deploy: 'text-primary',
  operate: 'text-on-surface',
  pay_down: 'text-error',
  classify: 'text-on-surface/70',
  divest: 'text-error',
}

const MIX_LABEL: Record<MixAnalysis['stance'], string> = {
  ok: 'Mezcla',
  rebalance_with_cash: 'Mezcla · no vender',
  divest_brick: 'Mezcla · reducir ladrillo',
  unknown: 'Mezcla',
}

function MixCard({ mix }: { mix: MixAnalysis }) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
      <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide mb-3">
        {MIX_LABEL[mix.stance]}
      </h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-body tabular-nums mb-3">
        <span className="text-on-surface">
          Ladrillo <span className="font-semibold">{mix.realEstatePct}%</span>
        </span>
        <span className="text-on-surface/70">
          Efectivo <span className="font-semibold">{mix.cashPct}%</span>
        </span>
        <span className="text-on-surface/70">
          Fondos <span className="font-semibold">{mix.investedPct}%</span>
        </span>
      </div>
      <p className="text-body font-medium text-on-surface font-body leading-relaxed">{mix.headline}</p>
      <p className="text-label-sm text-on-surface/50 font-body mt-1.5 leading-relaxed">{mix.detail}</p>
      {mix.shockMonths != null && (
        <p className="text-label-sm text-on-surface/45 font-body mt-2">
          Si el alquiler para: {mix.shockMonths} meses de efectivo
          {mix.shockTargetMonths > 6 ? ` · con tanto ladrillo, holgura ${mix.shockTargetMonths} meses` : ''}
        </p>
      )}
    </section>
  )
}

function MoveRow({ move }: { move: CapitalMove }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-label-sm font-semibold font-body uppercase tracking-wide ${STANCE_TONE[move.stance]}`}>
          {CAPITAL_STANCE_LABELS[move.stance]}
        </p>
        <p className="text-label font-medium text-on-surface font-body mt-0.5">{move.title}</p>
        <p className="text-label-sm text-on-surface/50 font-body mt-0.5 leading-relaxed">{move.detail}</p>
      </div>
      {move.amount != null && (
        <span className="text-label font-semibold font-body tabular-nums text-on-surface flex-shrink-0">
          {formatEur(move.amount, true)}
        </span>
      )}
    </li>
  )
}

function BucketRow({
  label,
  value,
  hint,
  warn,
  muted,
}: {
  label: string
  value: number
  hint?: string
  warn?: boolean
  muted?: boolean
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={`text-label font-body ${muted ? 'text-on-surface/40' : 'text-on-surface/70'}`}>
        {label}
        {hint && <span className="text-on-surface/40 font-normal"> · {hint}</span>}
      </span>
      <span
        className={`text-label font-semibold font-body tabular-nums ${
          warn ? 'text-error' : muted ? 'text-on-surface/40' : 'text-on-surface'
        }`}
      >
        {muted && value === 0 ? '—' : formatEur(value)}
      </span>
    </li>
  )
}
