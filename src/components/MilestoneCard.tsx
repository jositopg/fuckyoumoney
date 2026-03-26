import { formatEur } from '../utils/calculations'

interface MilestoneCardProps {
  autonomyMonths: number
  monthlyExpenses: number
}

const MILESTONES = [
  {
    months: 1,
    label: '1 mes',
    emoji: '🌱',
    description: 'El primer colchón real. Ya puedes afrontar un imprevisto sin entrar en pánico.',
  },
  {
    months: 3,
    label: '3 meses',
    emoji: '🛡️',
    description: 'El estándar recomendado. Tres meses te dan tiempo para reaccionar ante cualquier cambio.',
  },
  {
    months: 6,
    label: '6 meses',
    emoji: '🌊',
    description: 'Margen real. Medio año de independencia ante imprevistos laborales o personales.',
  },
  {
    months: 12,
    label: '1 año',
    emoji: '⚡',
    description: 'Un año entero. Puedes tomar decisiones importantes sin que el dinero te obligue.',
  },
  {
    months: 24,
    label: '2 años',
    emoji: '🏔️',
    description: 'El horizonte de la libertad financiera real. Tu dinero trabaja para ti.',
  },
]

export function MilestoneCard({ autonomyMonths, monthlyExpenses }: MilestoneCardProps) {
  if (!isFinite(autonomyMonths) || monthlyExpenses <= 0) return null

  const safeMonths = Math.max(0, autonomyMonths)
  const nextMilestone = MILESTONES.find(m => safeMonths < m.months)

  // All milestones achieved
  if (!nextMilestone) {
    return (
      <div className="bg-primary-container/40 rounded-xl px-4 py-3.5 flex items-center gap-3">
        <span className="text-xl flex-shrink-0">🏔️</span>
        <div>
          <p className="text-label font-semibold text-primary font-body">Todos los hitos superados</p>
          <p className="text-label-sm text-on-surface/50 font-body mt-0.5">
            Más de 2 años de autonomía. Estás donde pocos llegan.
          </p>
        </div>
      </div>
    )
  }

  const milestoneIdx = MILESTONES.indexOf(nextMilestone)
  const prevMonths = milestoneIdx > 0 ? MILESTONES[milestoneIdx - 1].months : 0
  const progress = Math.max(0, Math.min(
    (safeMonths - prevMonths) / (nextMilestone.months - prevMonths),
    1
  ))
  const eurosMissing = Math.ceil((nextMilestone.months - safeMonths) * monthlyExpenses)

  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xl flex-shrink-0 mt-0.5">{nextMilestone.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-label font-semibold text-on-surface font-body">
              Próximo hito: {nextMilestone.label}
            </p>
            <span className="text-label font-semibold text-primary font-body tabular-nums flex-shrink-0">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <p className="text-label-sm text-on-surface/50 font-body mt-0.5 leading-snug">
            {nextMilestone.description}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <p className="text-label-sm text-on-surface/40 font-body text-right">
        ~{formatEur(eurosMissing, true)} para el siguiente nivel
      </p>
    </div>
  )
}
