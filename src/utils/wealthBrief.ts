import type { Asset, CashMetadata, RealEstateMetadata } from '../types'
import {
  getAutonomyMonths,
  getDebtRatio,
  getEmergencyFundMonths,
  getLiquidAssets,
  getNetWorth,
  getTotalDebts,
  getTotalMonthlyDebtPayments,
  getTotalPositiveAssets,
} from './calculations'

export interface WealthBrief {
  asOf: string
  currency: 'EUR'
  totals: {
    netWorth: number
    totalAssets: number
    totalLiabilities: number
    liquidAssets: number
    realEstateValue: number
    monthlyExpenses: number
    monthlyDebtPayments: number
    monthlyPassiveIncome: number
    autonomyMonths: number | null
    emergencyFundMonths: number | null
    debtRatio: number
  }
  allocation: { class: string; value: number; pct: number }[]
  positions: {
    id: string
    name: string
    class: string
    kind: 'asset' | 'liability'
    value: number
    source: string
    readOnly: boolean
    liquid: boolean
    extra?: Record<string, unknown>
  }[]
  finca?: {
    monthlyContractedRent: number
    occupancyNote: string
    gaps: string[]
  }
  notesForModel: string[]
}

function monthlyPassiveIncome(assets: Asset[]): number {
  let sum = 0
  for (const a of assets) {
    if (a.category === 'real_estate') {
      sum += (a.metadata as RealEstateMetadata | undefined)?.monthlyRent ?? 0
    }
    if (a.category === 'cash') {
      const rate = (a.metadata as CashMetadata | undefined)?.interestRate
      if (rate && rate > 0) sum += (a.value * rate) / 100 / 12
    }
  }
  return Math.round(sum * 100) / 100
}

export function buildWealthBrief(assets: Asset[], monthlyExpenses: number): WealthBrief {
  const totalAssets = getTotalPositiveAssets(assets)
  const totalLiabilities = getTotalDebts(assets)
  const netWorth = getNetWorth(assets)
  const liquid = getLiquidAssets(assets)
  const realEstateValue = assets
    .filter(a => a.category === 'real_estate')
    .reduce((s, a) => s + a.value, 0)
  const autonomy = getAutonomyMonths(assets, monthlyExpenses)
  const emergency = getEmergencyFundMonths(assets, monthlyExpenses)
  const fincaAssets = assets.filter(a => a.source === 'finca' || a.readOnly)
  const monthlyRent = fincaAssets.reduce((s, a) => {
    return s + ((a.metadata as RealEstateMetadata | undefined)?.monthlyRent ?? 0)
  }, 0)

  const classes = ['cash', 'stocks', 'crypto', 'commodities', 'real_estate', 'vehicles', 'pension'] as const
  const allocation = classes
    .map(className => {
      const value = assets.filter(a => a.category === className).reduce((s, a) => s + a.value, 0)
      return {
        class: className,
        value,
        pct: totalAssets > 0 ? Math.round((value / totalAssets) * 1000) / 10 : 0,
      }
    })
    .filter(row => row.value > 0)

  const positions = assets.map(a => {
    const extra: Record<string, unknown> = {}
    if (a.symbol) extra.symbol = a.symbol
    if (a.metadata) Object.assign(extra, a.metadata)
    return {
      id: a.id,
      name: a.name,
      class: a.category,
      kind: (a.category === 'debt' ? 'liability' : 'asset') as 'asset' | 'liability',
      value: a.value,
      source: a.source ?? 'manual',
      readOnly: Boolean(a.readOnly),
      liquid: a.category === 'cash' || a.category === 'stocks' || a.category === 'crypto',
      extra: Object.keys(extra).length ? extra : undefined,
    }
  })

  const notesForModel = [
    'Cifras en EUR. No inventes números que no estén en este JSON.',
    'Los inmuebles con source=finca son de solo lectura; la gestión vive en la app Finca.',
    'Finca no envía principal de hipoteca. Si hay hipotecas, están en class=debt.',
    'Autonomía = (activos líquidos − deudas) / gastos mensuales. No uses el patrimonio inmobiliario para autonomía.',
  ]

  return {
    asOf: new Date().toISOString(),
    currency: 'EUR',
    totals: {
      netWorth,
      totalAssets,
      totalLiabilities,
      liquidAssets: liquid,
      realEstateValue,
      monthlyExpenses,
      monthlyDebtPayments: getTotalMonthlyDebtPayments(assets),
      monthlyPassiveIncome: monthlyPassiveIncome(assets),
      autonomyMonths: isFinite(autonomy) ? Math.round(autonomy * 10) / 10 : null,
      emergencyFundMonths: isFinite(emergency) ? Math.round(emergency * 10) / 10 : null,
      debtRatio: Math.round(getDebtRatio(assets) * 1000) / 1000,
    },
    allocation,
    positions,
    finca: fincaAssets.length
      ? {
          monthlyContractedRent: monthlyRent,
          occupancyNote: `${fincaAssets.length} inmuebles sincronizados desde Finca`,
          gaps: ['no_mortgage_principal'],
        }
      : undefined,
    notesForModel,
  }
}
