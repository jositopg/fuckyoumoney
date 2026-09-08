import type { Asset, RealEstateMetadata } from '../types'
import {
  getAutonomyMonths,
  getDebtRatio,
  getLiquidAssets,
  getNetWorth,
  getTotalDebts,
  getTotalPositiveAssets,
} from './calculations'
import { diagnoseWealth, type WealthDiagnosis } from './moneyDiagnosis'

export interface WealthBrief {
  asOf: string
  currency: 'EUR'
  totals: {
    netWorth: number
    totalAssets: number
    totalLiabilities: number
    liquidAssets: number
    realEstateValue: number
    realEstateTtmNet: number
    realEstateMonthlyGrossRent: number
    monthlyExpenses: number
    monthlyDebtPayments: number
    monthlyGrossPassive: number
    monthlyNetPassive: number
    autonomyMonths: number | null
    emergencyFundMonths: number | null
    emergencyAssigned: number
    idleCash: number
    parkedCash: number
    workingCash: number
    deployableCash: number
    invested: number
    debtRatio: number
  }
  diagnosis: WealthDiagnosis
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
    ttmNetCashflow: number
    occupancyNote: string
    gaps: string[]
  }
  notesForModel: string[]
}

export function buildWealthBrief(
  assets: Asset[],
  monthlyExpenses: number,
  emergencyTargetMonths?: number | null
): WealthBrief {
  const totalAssets = getTotalPositiveAssets(assets)
  const totalLiabilities = getTotalDebts(assets)
  const netWorth = getNetWorth(assets)
  const liquid = getLiquidAssets(assets)
  const diagnosis = diagnoseWealth(assets, monthlyExpenses, emergencyTargetMonths)
  const autonomy = getAutonomyMonths(assets, monthlyExpenses)
  const fincaAssets = assets.filter(a => a.source === 'finca' || a.readOnly)
  const monthlyRent = fincaAssets.reduce((s, a) => {
    return s + ((a.metadata as RealEstateMetadata | undefined)?.monthlyRent ?? 0)
  }, 0)
  const fincaTtm = fincaAssets.reduce((s, a) => {
    return s + ((a.metadata as RealEstateMetadata | undefined)?.ttmNetCashflow ?? 0)
  }, 0)

  const classes = [
    'cash',
    'stocks',
    'crypto',
    'commodities',
    'real_estate',
    'vehicles',
    'pension',
    'business',
    'receivable',
    'other',
  ] as const
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
      liquid: a.category === 'cash',
      extra: Object.keys(extra).length ? extra : undefined,
    }
  })

  const notesForModel = [
    'Cifras en EUR. No inventes números que no estén en este JSON.',
    'Lee diagnosis.verdict y diagnosis.headline antes de opinar. Las acciones ya están ordenadas.',
    'Efectivo: emergency = colchón (puede tener TAE). parked = apartado con motivo (reforma, juicio, impuestos…). Todo lo demás (idle/working legacy) = a fondos. TAE de cuenta NO es invertirlo.',
    'Inversiones: si el nombre es un fondo (Inbestme, Numantia, VWCE, ETF, Indexa…) trátalo como etf aunque type=other o falte ticker. No hace falta que el usuario deje ISIN perfecto.',
    'Diversificación de cartera financiera: mira region (world/us/europe/em/spain/asia) y assetClass (equity/bonds/mixed/money_market). No confundas ladrillo con esta manga.',
    'Lee diagnosis.moves y diagnosis.mix. mix.stance: ok | rebalance_with_cash | divest_brick | unknown.',
    'Ladrillo alto NO implica vender. Si el efectivo aguanta un parón de alquiler (≥6–12 meses), equilibra con fondos. Vender solo si el golpe no se cubre; candidatos = vacíos.',
    'Lee diagnosis.moves: leave / deploy / operate / pay_down / classify / divest. Deploy = aportar a que rinda (fondos), no vender fondos por el NAV del día.',
    'No recomiendes un fondo concreto ni un tracker en tiempo real. La foto es el valor al abrir.',
    'Inmuebles: usa ttmNetCashflow (neto 12 meses), no monthlyRent (bruto contratado).',
    'Los inmuebles con source=finca son de solo lectura; la gestión vive en la app Finca.',
    'Finca no envía principal de hipoteca. Si hay hipotecas, están en class=debt.',
    'Autonomía = (activos líquidos − deudas) / gastos mensuales. El ladrillo no cuenta para autonomía.',
  ]

  return {
    asOf: new Date().toISOString(),
    currency: 'EUR',
    totals: {
      netWorth,
      totalAssets,
      totalLiabilities,
      liquidAssets: liquid,
      realEstateValue: diagnosis.realEstate.value,
      realEstateTtmNet: diagnosis.realEstate.ttmNetCashflow,
      realEstateMonthlyGrossRent: diagnosis.realEstate.monthlyGrossRent,
      monthlyExpenses,
      monthlyDebtPayments: diagnosis.cashflow.monthlyDebtPayments,
      monthlyGrossPassive: diagnosis.cashflow.monthlyGrossPassive,
      monthlyNetPassive: diagnosis.cashflow.monthlyNetPassive,
      autonomyMonths: isFinite(autonomy) ? Math.round(autonomy * 10) / 10 : null,
      emergencyFundMonths: diagnosis.cashflow.emergencyMonths,
      emergencyAssigned: diagnosis.buckets.emergencyAssigned,
      idleCash: diagnosis.buckets.idle,
      parkedCash: diagnosis.buckets.parked,
      workingCash: diagnosis.buckets.working,
      deployableCash: diagnosis.capital.deployable,
      invested: diagnosis.capital.invested,
      debtRatio: Math.round(getDebtRatio(assets) * 1000) / 1000,
    },
    diagnosis,
    allocation,
    positions,
    finca: fincaAssets.length
      ? {
          monthlyContractedRent: monthlyRent,
          ttmNetCashflow: fincaTtm,
          occupancyNote: `${fincaAssets.length} inmuebles sincronizados desde Finca`,
          gaps: ['no_mortgage_principal'],
        }
      : undefined,
    notesForModel,
  }
}
