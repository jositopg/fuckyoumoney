import type { Asset, DebtMetadata } from '../types'
import { getEmergencyFundMonths, getLiquidAssets, formatEur } from '../utils/calculations'

interface PriorityCardProps {
  assets: Asset[]
  monthlyExpenses: number
}

interface Priority {
  icon: string
  title: string
  body: string
  highlight?: string
  warn: boolean
}

function getPriority(assets: Asset[], monthlyExpenses: number): Priority | null {
  if (assets.length === 0) return null

  // 1. High-interest debt (tarjeta or > 10% TIN)
  const expensiveDebts = assets.filter(a => {
    if (a.category !== 'debt') return false
    const meta = a.metadata as DebtMetadata | undefined
    return meta?.debtType === 'tarjeta' || (meta?.interestRate ?? 0) > 10
  })

  if (expensiveDebts.length > 0) {
    const monthlyInterest = expensiveDebts.reduce((s, a) => {
      const meta = a.metadata as DebtMetadata | undefined
      const rate = meta?.interestRate ?? (meta?.debtType === 'tarjeta' ? 22 : 12)
      return s + a.value * (rate / 100 / 12)
    }, 0)
    return {
      icon: '🔴',
      title: 'Primero: liquida la deuda cara',
      body: 'Tienes deuda con intereses altos. Cada mes que pasa, esa deuda te cobra más de lo que cualquier inversión conservadora puede ganar. Atacar esto antes que cualquier otra cosa es la decisión más inteligente ahora mismo.',
      highlight: `~${formatEur(Math.round(monthlyInterest))}/mes solo en intereses`,
      warn: true,
    }
  }

  if (monthlyExpenses <= 0) return null

  const emergencyMonths = getEmergencyFundMonths(assets, monthlyExpenses)
  const liquidAssets = getLiquidAssets(assets)
  const hasInvestments = assets.some(a => a.category === 'stocks' || a.category === 'crypto')

  // 2. No emergency fund (< 1 month liquid)
  if (!isFinite(emergencyMonths) || emergencyMonths < 1) {
    const needed = Math.max(0, Math.ceil(monthlyExpenses - liquidAssets))
    return {
      icon: '🛡️',
      title: 'Prioridad ahora: tu primer mes de seguridad',
      body: 'Sin un mes de gastos en activos líquidos, cualquier imprevisto se convierte en deuda. Antes de invertir o buscar rentabilidad, construye esta base. Es el único paso que no tiene alternativa.',
      highlight: needed > 0 ? `~${formatEur(needed)} para completar el primer mes` : undefined,
      warn: true,
    }
  }

  // 3. Emergency fund below 3 months
  if (emergencyMonths < 3) {
    const needed = Math.ceil((3 - emergencyMonths) * monthlyExpenses)
    return {
      icon: '🌱',
      title: 'Refuerza hasta 3 meses de colchón',
      body: 'Tienes un mes cubierto — ya es un logro real. El estándar recomendado son 3 meses: suficiente para superar cualquier imprevisto sin tomar decisiones forzadas ni entrar en deuda.',
      highlight: `~${formatEur(needed)} para llegar a 3 meses`,
      warn: false,
    }
  }

  // 4. Good emergency fund but no investments
  if (!hasInvestments) {
    return {
      icon: '📈',
      title: 'Tu colchón está. Hora de invertir',
      body: 'Tienes la base cubierta. El dinero que supere tus 3-6 meses de colchón no debería estar parado — la inflación lo erosiona en silencio. El siguiente paso es poner ese exceso en activos que crecen.',
      warn: false,
    }
  }

  // 5. On track
  return {
    icon: '✅',
    title: 'Buen camino — la clave es la consistencia',
    body: 'Tienes colchón e inversiones. Ahora el factor más importante es la regularidad: pequeñas aportaciones constantes a largo plazo producen resultados que parecen imposibles al principio. No importa cuánto — importa que sea cada mes.',
    warn: false,
  }
}

export function PriorityCard({ assets, monthlyExpenses }: PriorityCardProps) {
  const priority = getPriority(assets, monthlyExpenses)
  if (!priority) return null

  return (
    <div className={`rounded-xl p-4 ${priority.warn ? 'bg-surface-container-low' : priority.icon === '✅' ? 'bg-primary-container/30' : 'bg-surface-container-low'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${priority.warn ? 'bg-error/10' : 'bg-primary-container/50'}`}>
          <span className="text-base">{priority.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label font-semibold text-on-surface font-body mb-1">{priority.title}</p>
          <p className="text-label-sm text-on-surface/55 font-body leading-relaxed">{priority.body}</p>
          {priority.highlight && (
            <p className={`text-label font-semibold font-body mt-2 ${priority.warn ? 'text-error' : 'text-primary'}`}>
              {priority.highlight}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
