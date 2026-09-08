import type { Asset, CashJob, CashMetadata, DebtMetadata, RealEstateMetadata } from '../types'
import { formatEur, getTotalMonthlyDebtPayments, getTotalPositiveAssets } from './calculations'

export const DEFAULT_EMERGENCY_MONTHS = 6

export type Verdict = 'unknown' | 'weak' | 'ok' | 'solid'

export interface MoneyBuckets {
  emergency: number
  parked: number
  working: number
  idle: number
  /** True when no account is tagged emergency — unparked cash is treated as cushion. */
  emergencyAssumed: boolean
  /** Cash tagged emergency; 0 if none tagged. */
  emergencyAssigned: number
  unparked: number
}

export interface RealEstateYield {
  properties: number
  value: number
  rentalValue: number
  habitualValue: number
  monthlyGrossRent: number
  ttmNetCashflow: number
  monthlyNet: number
  grossYieldPct: number | null
  netYieldPct: number | null
  rented: number
  vacant: number
  renovation: number
  missingMarketValue: number
}

export interface DiagnosisAction {
  id: string
  title: string
  detail: string
}

export interface DiagnosisQuestion {
  id: string
  prompt: string
  why: string
}

/** What to do with a slice of capital. Not which fund or which piso. */
export type CapitalStance = 'leave' | 'deploy' | 'operate' | 'pay_down' | 'classify' | 'divest'

export const CAPITAL_STANCE_LABELS: Record<CapitalStance, string> = {
  leave: 'Dejar',
  deploy: 'Mover a que rinda',
  operate: 'Poner a producir',
  pay_down: 'Liquidar',
  classify: 'Asignar',
  divest: 'Reducir ladrillo',
}

/** Brick-heavy mix: sell only if a rent stop would force a fire sale. */
export type MixStance = 'ok' | 'rebalance_with_cash' | 'divest_brick' | 'unknown'

export interface MixAnalysis {
  totalAssets: number
  realEstatePct: number
  cashPct: number
  investedPct: number
  shockMonths: number | null
  shockTargetMonths: number
  incomeFromRePct: number | null
  stance: MixStance
  headline: string
  detail: string
}

export interface CapitalMove {
  id: string
  stance: CapitalStance
  amount: number | null
  title: string
  detail: string
}

export interface WealthDiagnosis {
  verdict: Verdict
  headline: string
  buckets: MoneyBuckets
  realEstate: RealEstateYield
  mix: MixAnalysis
  capital: {
    invested: number
    deployable: number
    expenseCoverage: number | null
  }
  cashflow: {
    monthlyExpenses: number
    monthlyDebtPayments: number
    monthlyCashInterest: number
    monthlyGrossPassive: number
    monthlyNetPassive: number
    emergencyTarget: number
    emergencyHave: number
    emergencyGap: number
    emergencyMonths: number | null
    targetMonths: number
    targetAsked: boolean
    expenseCoverage: number | null
  }
  moves: CapitalMove[]
  actions: DiagnosisAction[]
  questions: DiagnosisQuestion[]
  missing: string[]
}

const HABITUAL_STATUS = new Set(['vivienda_habitual', 'uso_propio'])

export function cashJob(asset: Asset): CashJob {
  const m = asset.metadata as CashMetadata | undefined
  if (m?.job === 'parked' || m?.job === 'emergency' || m?.job === 'working' || m?.job === 'idle') {
    return m.job
  }
  if ((m?.interestRate ?? 0) > 0) return 'working'
  return 'idle'
}

export function moneyBuckets(assets: Asset[]): MoneyBuckets {
  const cash = assets.filter(a => a.category === 'cash')
  let emergencyAssigned = 0
  let parked = 0
  let working = 0
  let idle = 0
  for (const a of cash) {
    const job = cashJob(a)
    if (job === 'emergency') emergencyAssigned += a.value
    else if (job === 'parked') parked += a.value
    else if (job === 'working') working += a.value
    else idle += a.value
  }
  const unparked = emergencyAssigned + working + idle
  const emergencyAssumed = emergencyAssigned <= 0 && unparked > 0
  return {
    emergency: emergencyAssumed ? unparked : emergencyAssigned,
    parked,
    working,
    idle,
    emergencyAssumed,
    emergencyAssigned,
    unparked,
  }
}

export function realEstateYield(assets: Asset[]): RealEstateYield {
  const props = assets.filter(a => a.category === 'real_estate')
  let value = 0
  let rentalValue = 0
  let habitualValue = 0
  let monthlyGrossRent = 0
  let ttmNetCashflow = 0
  let rented = 0
  let vacant = 0
  let renovation = 0
  let missingMarketValue = 0

  for (const a of props) {
    const m = a.metadata as RealEstateMetadata | undefined
    value += a.value
    const status = m?.status
    const habitual = m?.propertyType === 'vivienda_habitual' || (status != null && HABITUAL_STATUS.has(status))
    if (habitual) habitualValue += a.value
    else rentalValue += a.value

    monthlyGrossRent += m?.monthlyRent ?? 0
    ttmNetCashflow += m?.ttmNetCashflow ?? 0

    if (status === 'alquilado') rented += 1
    else if (status === 'vacio') vacant += 1
    else if (status === 'reforma') renovation += 1

    if (m?.valueSource !== 'mercado' || a.value <= 0) missingMarketValue += 1
  }

  const monthlyNet = ttmNetCashflow / 12
  const grossYieldPct =
    rentalValue > 0 && monthlyGrossRent > 0
      ? Math.round(((monthlyGrossRent * 12) / rentalValue) * 1000) / 10
      : null
  const netYieldPct =
    rentalValue > 0 && ttmNetCashflow !== 0
      ? Math.round((ttmNetCashflow / rentalValue) * 1000) / 10
      : rentalValue > 0 && ttmNetCashflow === 0
        ? 0
        : null

  return {
    properties: props.length,
    value,
    rentalValue,
    habitualValue,
    monthlyGrossRent: Math.round(monthlyGrossRent * 100) / 100,
    ttmNetCashflow: Math.round(ttmNetCashflow * 100) / 100,
    monthlyNet: Math.round(monthlyNet * 100) / 100,
    grossYieldPct,
    netYieldPct,
    rented,
    vacant,
    renovation,
    missingMarketValue,
  }
}

function cashInterestMonthly(assets: Asset[]): number {
  let sum = 0
  for (const a of assets) {
    if (a.category !== 'cash') continue
    const rate = (a.metadata as CashMetadata | undefined)?.interestRate ?? 0
    if (rate > 0) sum += (a.value * rate) / 100 / 12
  }
  return Math.round(sum * 100) / 100
}

function expensiveDebts(assets: Asset[]): Asset[] {
  return assets.filter(a => {
    if (a.category !== 'debt' || a.value <= 0) return false
    const m = a.metadata as DebtMetadata | undefined
    return m?.debtType === 'tarjeta' || (m?.interestRate ?? 0) > 10
  })
}

function parkedWithoutReason(assets: Asset[]): Asset[] {
  return assets.filter(a => {
    if (a.category !== 'cash') return false
    if (cashJob(a) !== 'parked') return false
    const reason = (a.metadata as CashMetadata | undefined)?.parkedReason?.trim()
    return !reason
  })
}

export function investedMarket(assets: Asset[]): number {
  return assets
    .filter(a => a.category === 'stocks' || a.category === 'crypto')
    .reduce((s, a) => s + a.value, 0)
}

function sharePct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

export function mixAnalysis(args: {
  assets: Asset[]
  buckets: MoneyBuckets
  re: RealEstateYield
  invested: number
  monthlyExpenses: number
  monthlyNetPassive: number
}): MixAnalysis {
  const { buckets, re, invested, monthlyExpenses, monthlyNetPassive } = args
  const totalAssets = getTotalPositiveAssets(args.assets)
  const cash = buckets.unparked + buckets.parked
  const realEstatePct = sharePct(re.value, totalAssets)
  const cashPct = sharePct(cash, totalAssets)
  const investedPct = sharePct(invested, totalAssets)
  const concentrated = realEstatePct >= 60
  const shockTargetMonths = concentrated ? 12 : 6
  const shockMonths =
    monthlyExpenses > 0 ? Math.round((buckets.unparked / monthlyExpenses) * 10) / 10 : null
  const incomeFromRePct =
    monthlyNetPassive > 0 ? sharePct(re.monthlyNet, monthlyNetPassive) : re.monthlyNet > 0 ? 100 : null

  let stance: MixStance = 'ok'
  let headline: string
  let detail: string

  if (totalAssets <= 0 || re.properties === 0) {
    stance = 'ok'
    headline = 'Sin ladrillo no hay sesgo inmobiliario que juzgar.'
    detail = 'La mezcla se mira cuando hay inmuebles y otra cosa al lado.'
  } else if (!(monthlyExpenses > 0)) {
    stance = 'unknown'
    headline = `El ladrillo es el ${realEstatePct}% del patrimonio.`
    detail = `Efectivo ${cashPct}% · fondos ${investedPct}%. Sin tu gasto no se sabe si el efectivo aguanta un parón de alquiler. No vendas hasta saberlo.`
  } else if (!concentrated) {
    stance = 'ok'
    headline = `La mezcla no está atrapada en ladrillo (${realEstatePct}%).`
    detail =
      shockMonths != null
        ? `Si el alquiler para, el efectivo cubre ${shockMonths} meses. Eso es holgura, no un incendio.`
        : 'Hay margen fuera del inmueble.'
  } else if (shockMonths != null && shockMonths < 6) {
    stance = 'divest_brick'
    headline = `Si el alquiler para, el efectivo no llega a 6 meses.`
    detail = `Ladrillo ${realEstatePct}% · efectivo ${cashPct}%. Equilibrar aquí es vender (empieza por vacíos), no aportar a fondos: eso te dejaría aún menos colchón.`
  } else if (shockMonths != null && shockMonths < shockTargetMonths && re.vacant >= 2) {
    stance = 'divest_brick'
    headline = `El ladrillo pesa ${realEstatePct}% y hay ${re.vacant} vacíos.`
    detail = `Si el alquiler para, el efectivo cubre ${shockMonths} meses (objetivo ${shockTargetMonths} con tanto inmueble). Los vacíos son los candidatos a vender; lo que ya alquila, no.`
  } else if (shockMonths != null && shockMonths >= 6 && investedPct < 15) {
    stance = 'rebalance_with_cash'
    headline = `El ladrillo pesa ${realEstatePct}%, pero no hace falta vender.`
    detail = `Si el alquiler para, el efectivo cubre ${shockMonths} meses. El equilibrio sale de poner el sobrante en fondos, no de deshacer pisos. Casi toda la renta neta sale del alquiler; los fondos diversifican esa renta.`
  } else {
    stance = 'ok'
    headline = `Ladrillo ${realEstatePct}%, y hay colchón de golpe.`
    detail =
      shockMonths != null
        ? `El efectivo cubre ${shockMonths} meses si el alquiler para. Fondos ${investedPct}%.`
        : `Fondos ${investedPct}% · efectivo ${cashPct}%.`
  }

  return {
    totalAssets,
    realEstatePct,
    cashPct,
    investedPct,
    shockMonths,
    shockTargetMonths,
    incomeFromRePct,
    stance,
    headline,
    detail,
  }
}

/** Cash that can go to funds after the cushion. 0 until monthly expenses are known. */
export function deployableCash(
  buckets: MoneyBuckets,
  emergencyTarget: number,
  monthlyExpenses: number
): number {
  if (!(monthlyExpenses > 0)) return 0
  if (buckets.emergencyAssumed) return Math.max(0, buckets.unparked - emergencyTarget)
  return Math.max(0, buckets.idle)
}

export function diagnoseWealth(
  assets: Asset[],
  monthlyExpenses: number,
  emergencyTargetMonths?: number | null
): WealthDiagnosis {
  const buckets = moneyBuckets(assets)
  const re = realEstateYield(assets)
  const targetAsked = emergencyTargetMonths != null && emergencyTargetMonths > 0
  const targetMonths = targetAsked ? emergencyTargetMonths : DEFAULT_EMERGENCY_MONTHS
  const emergencyHave = buckets.emergency
  const emergencyTarget = monthlyExpenses > 0 ? targetMonths * monthlyExpenses : 0
  const emergencyGap = Math.max(0, emergencyTarget - emergencyHave)
  const emergencyMonths =
    monthlyExpenses > 0 ? Math.round((emergencyHave / monthlyExpenses) * 10) / 10 : null
  const monthlyCashInterest = cashInterestMonthly(assets)
  const monthlyDebtPayments = getTotalMonthlyDebtPayments(assets)
  const monthlyGrossPassive = Math.round((re.monthlyGrossRent + monthlyCashInterest) * 100) / 100
  const monthlyNetPassive = Math.round((re.monthlyNet + monthlyCashInterest) * 100) / 100
  const invested = investedMarket(assets)
  const deployable = deployableCash(buckets, emergencyTarget, monthlyExpenses)
  const expenseCoverage =
    monthlyExpenses > 0 ? Math.round((monthlyNetPassive / monthlyExpenses) * 1000) / 1000 : null
  const mix = mixAnalysis({
    assets,
    buckets,
    re,
    invested,
    monthlyExpenses,
    monthlyNetPassive,
  })

  const missing: string[] = []
  const questions: DiagnosisQuestion[] = []
  const actions: DiagnosisAction[] = []
  const moves: CapitalMove[] = []

  if (!(monthlyExpenses > 0)) {
    missing.push('monthly_expenses')
    questions.push({
      id: 'expenses',
      prompt: '¿Cuánto gastas al mes para vivir?',
      why: 'Sin ese número no se puede decir si el colchón o la renta cubren tu vida.',
    })
  }

  if (!targetAsked) {
    questions.push({
      id: 'emergency_target',
      prompt: '¿Cuántos meses de gastos quieres dejar de emergencia?',
      why: `Por defecto usamos ${DEFAULT_EMERGENCY_MONTHS} meses. El colchón se mide contra tu número, no contra un estándar ajeno.`,
    })
  }

  if (buckets.idle > 0) {
    questions.push({
      id: 'idle_cash',
      prompt: `Hay ${formatEur(buckets.idle)} parados. ¿Es colchón, está aparcado por algo, o sobra para que rinda?`,
      why: 'El efectivo sin trabajo ni motivo es el hueco más fácil de leer — y el que más distorsiona un diagnóstico.',
    })
  }

  const parkedBlank = parkedWithoutReason(assets)
  if (parkedBlank.length > 0) {
    const names = parkedBlank.map(a => a.name).join(', ')
    questions.push({
      id: 'parked_reason',
      prompt: `¿Para qué está aparcado el dinero de ${names}?`,
      why: 'Si no hay motivo (impuestos, entrada, reforma, reserva), no está aparcado: está parado.',
    })
  }

  const pricey = expensiveDebts(assets)
  if (pricey.length > 0) {
    const monthlyInterest = pricey.reduce((s, a) => {
      const m = a.metadata as DebtMetadata | undefined
      const rate = m?.interestRate ?? (m?.debtType === 'tarjeta' ? 22 : 12)
      return s + a.value * (rate / 100 / 12)
    }, 0)
    const debtSum = pricey.reduce((s, a) => s + a.value, 0)
    actions.push({
      id: 'expensive_debt',
      title: 'Liquida la deuda cara',
      detail: `${formatEur(Math.round(monthlyInterest))}/mes solo en intereses. Eso gana a cualquier cuenta remunerada.`,
    })
    moves.push({
      id: 'expensive_debt',
      stance: 'pay_down',
      amount: debtSum,
      title: 'Deuda cara',
      detail: 'Antes de aportar a fondos. El interés que pagas gana a lo que rinde una cuenta o un índice este año.',
    })
  }

  if (!(monthlyExpenses > 0) && buckets.unparked > 0) {
    moves.push({
      id: 'need_expenses',
      stance: 'classify',
      amount: buckets.unparked,
      title: 'Efectivo sin partir',
      detail: 'Sin el gasto mensual no se sabe cuánto es colchón y cuánto sobra para fondos.',
    })
  }

  if (monthlyExpenses > 0 && emergencyGap > 0) {
    const haveLabel = buckets.emergencyAssumed ? 'sin asignar' : `${emergencyMonths} meses`
    actions.push({
      id: 'fill_emergency',
      title: `Completa el colchón (${targetMonths} meses)`,
      detail: `Ahora ${haveLabel}. Faltan ${formatEur(Math.round(emergencyGap))} en efectivo de emergencia, no en fondos.`,
    })
    moves.push({
      id: 'fill_emergency',
      stance: 'leave',
      amount: Math.round(emergencyGap),
      title: `Apartar a colchón (${targetMonths} meses)`,
      detail: 'Ese trozo se deja en efectivo. No va a fondos.',
    })
  }

  if (
    buckets.emergencyAssumed &&
    monthlyExpenses > 0 &&
    emergencyGap <= 0 &&
    emergencyTarget > 0
  ) {
    moves.push({
      id: 'hold_cushion',
      stance: 'leave',
      amount: Math.round(emergencyTarget),
      title: `Colchón (${targetMonths} meses)`,
      detail: 'Se queda en efectivo. Márcalo en las cuentas para no volver a mezclarlo.',
    })
  }

  if (deployable > 0 && mix.stance !== 'divest_brick') {
    actions.push({
      id: 'deploy_idle',
      title: 'El sobrante tiene que rendir',
      detail: `${formatEur(deployable)} no son colchón. A fondos (u otro activo que rinda). Eligiendo el fondo no se gana; moviéndolo, sí.`,
    })
    moves.push({
      id: 'deploy_idle',
      stance: 'deploy',
      amount: Math.round(deployable),
      title: buckets.emergencyAssumed ? 'Sobrante de cuentas → que rinda' : 'Efectivo parado → que rinda',
      detail:
        mix.stance === 'rebalance_with_cash'
          ? 'Eso equilibra el ladrillo sin vender pisos. El valor al abrir la app es la foto.'
          : invested > 0
            ? 'Aportar a lo que ya está invertido. No hace falta un tracker: el valor al abrir la app es la foto.'
            : 'A fondos. No hace falta elegir el producto aquí, ni seguir el mercado cada día.',
    })
  } else if (buckets.idle > 0 && !(buckets.emergencyAssumed && emergencyGap > 0) && monthlyExpenses <= 0) {
    actions.push({
      id: 'assign_idle',
      title: 'Ponle un trabajo al efectivo parado',
      detail: `${formatEur(buckets.idle)} al 0% y sin motivo. O es emergencia, o está aparcado, o debería rendir.`,
    })
  }

  if (
    buckets.working > 0 &&
    monthlyExpenses > 0 &&
    emergencyGap <= 0 &&
    buckets.working >= monthlyExpenses
  ) {
    moves.push({
      id: 'working_surplus',
      stance: 'deploy',
      amount: Math.round(buckets.working),
      title: 'Efectivo que rinde poco',
      detail: 'TAE de cuenta no es un fondo. Si no lo vas a gastar en 1–3 años, también a que rinda de verdad.',
    })
  }

  if (re.vacant > 0 && mix.stance === 'divest_brick') {
    actions.push({
      id: 'divest_vacant',
      title: `Reducir ladrillo: ${re.vacant} vacío${re.vacant === 1 ? '' : 's'}`,
      detail: 'Si pasa algo, no hay efectivo de sobra. Los vacíos son los que se venden; lo alquilado, no.',
    })
    moves.push({
      id: 'divest_vacant',
      stance: 'divest',
      amount: null,
      title: `${re.vacant} inmueble${re.vacant === 1 ? '' : 's'} vacío${re.vacant === 1 ? '' : 's'} → vender`,
      detail: 'No aportes ese dinero a más ladrillo. A colchón y fondos. Se decide en Finca.',
    })
  } else if (re.vacant > 0) {
    actions.push({
      id: 'vacant_re',
      title: `${re.vacant} inmueble${re.vacant === 1 ? '' : 's'} vacío${re.vacant === 1 ? '' : 's'}`,
      detail: 'El valor está en el patrimonio; el neto del año no. El hueco está en Finca, no aquí.',
    })
    moves.push({
      id: 'vacant_re',
      stance: 'operate',
      amount: null,
      title: `${re.vacant} inmueble${re.vacant === 1 ? '' : 's'} vacío${re.vacant === 1 ? '' : 's'}`,
      detail:
        mix.stance === 'rebalance_with_cash'
          ? 'Ponerlos a producir. El equilibrio de la mezcla sale del efectivo a fondos, no de vender lo que ya tienes alquilado.'
          : 'Ponerlos a producir. Vender solo si el golpe de liquidez no se cubre con efectivo.',
    })
  }

  if (mix.stance === 'divest_brick' && re.vacant === 0) {
    moves.push({
      id: 'divest_brick',
      stance: 'divest',
      amount: null,
      title: 'Reducir ladrillo',
      detail: mix.detail,
    })
  }

  if (re.monthlyGrossRent > 0 && re.ttmNetCashflow === 0) {
    missing.push('real_estate_ttm_net')
    actions.push({
      id: 'missing_re_net',
      title: 'El alquiler bruto no es el neto',
      detail: `${formatEur(re.monthlyGrossRent)}/mes contratados, 0 € netos en 12 meses. Faltan movimientos en Finca o el neto aún no llegó.`,
    })
  }

  if (re.missingMarketValue > 0) {
    missing.push('real_estate_market_value')
    actions.push({
      id: 'missing_re_value',
      title: `${re.missingMarketValue} piso${re.missingMarketValue === 1 ? '' : 's'} sin valor de mercado`,
      detail: 'El patrimonio inmobiliario está incompleto. El catastro no sirve para decidir.',
    })
  }

  let verdict: Verdict = 'solid'
  if (!(monthlyExpenses > 0)) verdict = 'unknown'
  else if (pricey.length > 0 || (emergencyMonths != null && emergencyMonths < 1)) verdict = 'weak'
  else if (
    emergencyGap > 0 ||
    buckets.idle > 0 ||
    deployable > 0 ||
    re.vacant > 0 ||
    mix.stance === 'divest_brick'
  )
    verdict = 'ok'

  let headline: string
  if (verdict === 'unknown') {
    headline = 'Falta tu gasto mensual para saber si el patrimonio está bien o mal.'
  } else if (pricey.length > 0) {
    headline = 'Hay deuda cara. Eso manda sobre cualquier otra decisión.'
  } else if (emergencyMonths != null && emergencyMonths < 1) {
    headline = `El colchón no cubre un mes. Prioridad: liquidez, no más ladrillo.`
  } else if (emergencyGap > 0 && deployable > 0) {
    headline = `Aparta ${formatEur(Math.round(emergencyGap))} de colchón. ${formatEur(deployable)} sobran: a que rindan.`
  } else if (emergencyGap > 0) {
    headline = `Colchón: ${emergencyMonths} meses. Te faltan ${formatEur(Math.round(emergencyGap))} para llegar a ${targetMonths}.`
  } else if (deployable > 0) {
    headline = `El colchón está. ${formatEur(deployable)} deberían estar rindiendo, no en cuenta.`
  } else if (buckets.idle > 0) {
    headline = `El colchón está. ${formatEur(buckets.idle)} están parados al 0%.`
  } else if (re.properties > 0) {
    headline =
      re.ttmNetCashflow !== 0
        ? `El efectivo tiene trabajo. El inmobiliario deja ${formatEur(Math.round(re.ttmNetCashflow))} netos al año.`
        : `El efectivo tiene trabajo. Del inmobiliario solo hay valor, no un neto claro.`
  } else {
    headline = 'El efectivo tiene trabajo. No hay dinero parado sin motivo.'
  }

  return {
    verdict,
    headline,
    buckets,
    realEstate: re,
    mix,
    capital: {
      invested,
      deployable: Math.round(deployable),
      expenseCoverage,
    },
    cashflow: {
      monthlyExpenses,
      monthlyDebtPayments,
      monthlyCashInterest,
      monthlyGrossPassive,
      monthlyNetPassive,
      emergencyTarget,
      emergencyHave,
      emergencyGap,
      emergencyMonths,
      targetMonths,
      targetAsked,
      expenseCoverage,
    },
    moves: moves.slice(0, 4),
    actions: actions.slice(0, 3),
    questions: questions.slice(0, 3),
    missing,
  }
}
