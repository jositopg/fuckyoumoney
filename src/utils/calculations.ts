import type { Asset } from '../types'
import { LIQUID_CATEGORIES } from '../types'

export function formatEur(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatMonths(months: number): string {
  if (!isFinite(months) || months < 0) return '0'
  if (months >= 12) {
    const years = Math.floor(months / 12)
    const rem = Math.round(months % 12)
    if (rem === 0) return `${years} año${years !== 1 ? 's' : ''}`
    return `${years}a ${rem}m`
  }
  return `${Math.round(months * 10) / 10}`
}

export function getNetWorth(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + (a.category === 'debt' ? -Math.abs(a.value) : a.value), 0)
}

export function getLiquidAssets(assets: Asset[]): number {
  return assets
    .filter(a => LIQUID_CATEGORIES.includes(a.category))
    .reduce((sum, a) => sum + a.value, 0)
}

export function getTotalDebts(assets: Asset[]): number {
  return assets
    .filter(a => a.category === 'debt')
    .reduce((sum, a) => sum + Math.abs(a.value), 0)
}

export function getTotalPositiveAssets(assets: Asset[]): number {
  return assets
    .filter(a => a.category !== 'debt')
    .reduce((sum, a) => sum + a.value, 0)
}

export function getAutonomyMonths(assets: Asset[], monthlyExpenses: number): number {
  if (!monthlyExpenses || monthlyExpenses <= 0) return Infinity
  const liquid = getLiquidAssets(assets)
  const debts = getTotalDebts(assets)
  const net = liquid - debts
  return net / monthlyExpenses
}

export function getEmergencyFundMonths(assets: Asset[], monthlyExpenses: number): number {
  if (!monthlyExpenses || monthlyExpenses <= 0) return Infinity
  const liquid = getLiquidAssets(assets)
  return liquid / monthlyExpenses
}

export function getDebtRatio(assets: Asset[]): number {
  const totalPositive = getTotalPositiveAssets(assets)
  if (totalPositive <= 0) return 0
  const debts = getTotalDebts(assets)
  return debts / totalPositive
}

export interface AutonomyLevel {
  label: string
  description: string
  color: string
}

export function getAutonomyLevel(months: number): AutonomyLevel {
  if (!isFinite(months) || months < 0) {
    return { label: 'Tu punto de partida', description: 'Desde aquí se construye todo', color: 'text-on-surface' }
  }
  if (months < 3) {
    return { label: 'Estás construyendo tu base', description: 'Cada euro cuenta ahora mismo', color: 'text-on-surface' }
  }
  if (months < 6) {
    return { label: 'Tienes un colchón sólido', description: 'Puedes afrontar imprevistos', color: 'text-primary' }
  }
  if (months < 12) {
    return { label: 'Tienes margen real', description: 'Espacio para tomar decisiones', color: 'text-primary' }
  }
  if (months < 24) {
    return { label: 'Tienes autonomía', description: 'Puedes decir no cuando importa', color: 'text-primary' }
  }
  return { label: 'Tienes libertad', description: 'El dinero trabaja para ti', color: 'text-primary' }
}

export function getContextualMessage(months: number, netWorth: number, debtRatio: number): string {
  if (netWorth === 0 && months <= 0) {
    return 'Este es tu punto de partida. Todos empezaron aquí.'
  }
  if (debtRatio > 0.5) {
    return 'Reducir deuda es la mejor inversión que puedes hacer ahora mismo.'
  }
  if (months < 1) {
    return 'El dinero vale por las opciones que da. Empieza a construir las tuyas.'
  }
  if (months < 3) {
    return 'Tener suficiente para poder decir no. Ese es el objetivo.'
  }
  if (months < 6) {
    return 'Tu colchón crece. La tranquilidad financiera se construye mes a mes.'
  }
  if (months < 12) {
    return 'Ya tienes margen real para elegir. Sigue construyendo.'
  }
  if (months < 24) {
    return 'La autonomía financiera no es lujo, es la forma más inteligente de vivir.'
  }
  return 'Has alcanzado lo que pocos logran: la libertad de elegir sin que el dinero mande.'
}

export function getTotalMonthlyDebtPayments(assets: Asset[]): number {
  return assets
    .filter(a => a.category === 'debt')
    .reduce((sum, a) => {
      const meta = a.metadata as { monthlyPayment?: number } | undefined
      return sum + (meta?.monthlyPayment ?? 0)
    }, 0)
}

export function getDiversificationWarning(assets: Asset[]): string | null {
  const totalPositive = getTotalPositiveAssets(assets)
  if (totalPositive <= 0) return null

  const byCategory: Record<string, number> = {}
  assets.filter(a => a.category !== 'debt').forEach(a => {
    byCategory[a.category] = (byCategory[a.category] || 0) + a.value
  })

  for (const [cat, val] of Object.entries(byCategory)) {
    if (val / totalPositive > 0.7) {
      const labels: Record<string, string> = {
        cash: 'efectivo',
        stocks: 'renta variable',
        crypto: 'cripto',
        real_estate: 'inmuebles',
        vehicles: 'vehículos',
        pension: 'pensión',
      }
      return `Más del 70% de tus activos está en ${labels[cat] || cat}. Considera diversificar.`
    }
  }
  return null
}
