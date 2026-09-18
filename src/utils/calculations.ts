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

/** Legado: (cash+stocks+crypto − deudas) / gasto. El colchón real es cash job=emergency. */
export function getAutonomyMonths(assets: Asset[], monthlyExpenses: number): number {
  if (!monthlyExpenses || monthlyExpenses <= 0) return Infinity
  const liquid = getLiquidAssets(assets)
  const debts = getTotalDebts(assets)
  const net = liquid - debts
  return net / monthlyExpenses
}

export function getDebtRatio(assets: Asset[]): number {
  const totalPositive = getTotalPositiveAssets(assets)
  if (totalPositive <= 0) return 0
  const debts = getTotalDebts(assets)
  return debts / totalPositive
}

export function getTotalMonthlyDebtPayments(assets: Asset[]): number {
  return assets
    .filter(a => a.category === 'debt')
    .reduce((sum, a) => {
      const meta = a.metadata as { monthlyPayment?: number } | undefined
      return sum + (meta?.monthlyPayment ?? 0)
    }, 0)
}
