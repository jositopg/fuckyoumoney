import type { Asset } from '../types'
import { formatEur } from '../utils/calculations'
import {
  CAPITAL_STANCE_LABELS,
  diagnoseWealth,
  parkedSlices,
  type CapitalMove,
  type DiagnosisQuestion,
} from '../utils/moneyDiagnosis'
import { MixPanel } from './AllocationPanel'

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

const VERDICT_LABEL: Record<string, string> = {
  unknown: 'Faltan datos',
  weak: 'Ahora mismo',
  ok: 'Bien, con matices',
  solid: 'En orden',
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
  const coverage =
    cashflow.expenseCoverage != null ? Math.round(cashflow.expenseCoverage * 100) : null

  return (
    <div className="mb-6 space-y-3">
      <section className={`rounded-xl px-4 py-3 ${VERDICT_TONE[d.verdict]}`}>
        <p className="text-label-sm font-semibold text-on-surface/45 font-body uppercase tracking-wide">
          {VERDICT_LABEL[d.verdict]}
        </p>
        <p className="text-body font-medium text-on-surface font-body leading-snug mt-0.5">{d.headline}</p>
        {coverage != null && (
          <p className="text-label-sm font-body tabular-nums text-on-surface/50 mt-1">
            Renta neta cubre {coverage}%
          </p>
        )}
        {d.questions.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {d.questions.map(q => (
              <button
                key={q.id}
                type="button"
                onClick={() => onAsk?.(q)}
                className="w-full text-left rounded-lg bg-surface/70 px-3 py-2
                  hover:bg-surface transition-colors text-label font-medium text-on-surface font-body"
              >
                {q.prompt}
              </button>
            ))}
          </div>
        )}
      </section>

      {d.mix.totalAssets > 0 && <MixPanel mix={d.mix} />}

      {d.moves.length > 0 && (
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
          <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide mb-2">
            Qué hacer
          </h3>
          <ul className="divide-y divide-surface-container-low">
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
          <div className="grid grid-cols-3 gap-2">
            <CashStat
              label="Colchón"
              value={buckets.emergencyAssigned}
              hint={
                buckets.emergencyAssumed
                  ? 'sin marcar'
                  : cashflow.emergencyMonths != null
                    ? `${cashflow.emergencyMonths} m`
                    : undefined
              }
              muted={buckets.emergencyAssumed}
            />
            <CashStat
              label="Apartado"
              value={buckets.parked}
              hint={
                buckets.parked > 0
                  ? parkedSlices(assets)
                      .map(s => s.reason)
                      .join(', ')
                  : undefined
              }
            />
            <CashStat
              label="A invertir"
              value={buckets.toInvest}
              warn={buckets.toInvest > 0}
            />
          </div>
        </section>
      )}

      {re.properties > 0 && (
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide">
              Inmuebles
            </h3>
            <p className="text-label-sm text-on-surface/45 font-body">
              {re.rented} alquilados
              {re.vacant > 0 ? ` · ${re.vacant} vacíos` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Valor" value={formatEur(re.value, true)} />
            <Stat
              label="Neto 12 meses"
              value={formatEur(Math.round(re.ttmNetCashflow), true)}
              tone={re.ttmNetCashflow > 0 ? 'text-primary' : undefined}
            />
            <Stat label="Bruto" value={`${formatEur(re.monthlyGrossRent)}/mes`} small />
            <Stat
              label="Rentabilidad neta"
              value={re.netYieldPct == null ? '—' : `${re.netYieldPct}%`}
              small
            />
          </div>
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

function MoveRow({ move }: { move: CapitalMove }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className={`text-label-sm font-semibold font-body uppercase tracking-wide ${STANCE_TONE[move.stance]}`}>
          {CAPITAL_STANCE_LABELS[move.stance]}
        </p>
        <p className="text-label font-medium text-on-surface font-body truncate">{move.title}</p>
      </div>
      {move.amount != null && (
        <span className="text-lg font-display font-semibold tabular-nums text-on-surface flex-shrink-0">
          {formatEur(move.amount, true)}
        </span>
      )}
    </li>
  )
}

function CashStat({
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
    <div>
      <p className="text-label-sm text-on-surface/50 font-body truncate">{label}</p>
      <p
        className={`text-headline font-display font-semibold tabular-nums ${
          warn ? 'text-error' : muted ? 'text-on-surface/40' : 'text-on-surface'
        }`}
      >
        {muted && value === 0 ? '—' : formatEur(value, true)}
      </p>
      {hint && (
        <p className="text-label-sm text-on-surface/40 font-body truncate mt-0.5">{hint}</p>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string
  value: string
  tone?: string
  small?: boolean
}) {
  return (
    <div>
      <p className="text-label-sm text-on-surface/50 font-body">{label}</p>
      <p
        className={`${small ? 'text-body font-semibold font-body' : 'text-headline font-display font-semibold'} tabular-nums ${tone ?? 'text-on-surface'}`}
      >
        {value}
      </p>
    </div>
  )
}
