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
  /** idle + working: not cushion, not earmarked → should be invested. */
  toInvest: number
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

export type MixProfile = 'landlord' | 'financial'

export interface MixBand {
  min: number
  max: number
}

/** Landlord: RE is the trade. Financial: mostly funds. Bands, not a magic %. */
export const LANDLORD_BANDS = {
  realEstate: { min: 50, max: 70 } satisfies MixBand,
  invested: { min: 20, max: 35 } satisfies MixBand,
}

export const FINANCIAL_BANDS = {
  realEstate: { min: 0, max: 25 } satisfies MixBand,
  invested: { min: 60, max: 85 } satisfies MixBand,
}

export interface MixSleeve {
  id: 'real_estate' | 'home' | 'invested' | 'cash' | 'parked' | 'rest'
  label: string
  current: number
  currentPct: number
  band: MixBand | null
  /** Points outside the band. >0 overweight, <0 underweight, 0 inside. */
  deltaPts: number
  gapEur: number
}

export interface MixTarget {
  profile: MixProfile
  sleeves: MixSleeve[]
  afterDeploy: {
    realEstatePct: number
    investedPct: number
    cashPct: number
  }
  brickOverEur: number
  fundsShortEur: number
  closableNow: number
}

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
  /** One line for the cover. */
  line: string
  target: MixTarget
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
  if (m?.job === 'parked' || m?.job === 'emergency' || m?.job === 'idle') return m.job
  // Legacy `working` (TAE without a purpose) is cash that should be invested.
  if (m?.job === 'working') return 'idle'
  return 'idle'
}

export function moneyBuckets(assets: Asset[]): MoneyBuckets {
  const cash = assets.filter(a => a.category === 'cash')
  let emergencyAssigned = 0
  let parked = 0
  let idle = 0
  for (const a of cash) {
    const job = cashJob(a)
    if (job === 'emergency') emergencyAssigned += a.value
    else if (job === 'parked') parked += a.value
    else idle += a.value
  }
  const unparked = emergencyAssigned + idle
  const emergencyAssumed = emergencyAssigned <= 0 && unparked > 0
  return {
    emergency: emergencyAssumed ? unparked : emergencyAssigned,
    parked,
    working: 0,
    idle,
    emergencyAssumed,
    emergencyAssigned,
    unparked,
    toInvest: idle,
  }
}

export function parkedSlices(assets: Asset[]): { reason: string; value: number }[] {
  const byReason = new Map<string, number>()
  for (const a of assets) {
    if (a.category !== 'cash' || cashJob(a) !== 'parked') continue
    const reason = (a.metadata as CashMetadata | undefined)?.parkedReason?.trim() || 'Sin motivo'
    byReason.set(reason, (byReason.get(reason) ?? 0) + a.value)
  }
  return [...byReason.entries()]
    .map(([reason, value]) => ({ reason, value }))
    .sort((a, b) => b.value - a.value)
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
    .filter(a => a.category === 'stocks' || a.category === 'crypto' || a.category === 'commodities')
    .reduce((s, a) => s + a.value, 0)
}

function sharePct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

function sleeveDelta(currentPct: number, band: MixBand | null): { deltaPts: number; gapEur: number } {
  if (!band) return { deltaPts: 0, gapEur: 0 }
  if (currentPct > band.max) {
    const deltaPts = Math.round((currentPct - band.max) * 10) / 10
    return { deltaPts, gapEur: 0 }
  }
  if (currentPct < band.min) {
    const deltaPts = Math.round((currentPct - band.min) * 10) / 10
    return { deltaPts, gapEur: 0 }
  }
  return { deltaPts: 0, gapEur: 0 }
}

function eurOutsideBand(current: number, total: number, band: MixBand): number {
  if (total <= 0) return 0
  const maxEur = (band.max / 100) * total
  const minEur = (band.min / 100) * total
  if (current > maxEur) return Math.round(current - maxEur)
  if (current < minEur) return Math.round(minEur - current)
  return 0
}

function makeSleeve(
  id: MixSleeve['id'],
  label: string,
  current: number,
  total: number,
  band: MixBand | null
): MixSleeve {
  const currentPct = sharePct(current, total)
  const { deltaPts } = sleeveDelta(currentPct, band)
  return {
    id,
    label,
    current,
    currentPct,
    band,
    deltaPts,
    gapEur: band ? eurOutsideBand(current, total, band) : 0,
  }
}

export function mixTarget(args: {
  totalAssets: number
  realEstate: number
  rentalValue: number
  habitualValue: number
  properties: number
  invested: number
  unparked: number
  parked: number
  deployable: number
}): MixTarget {
  const total = args.totalAssets
  const rental = args.rentalValue
  const home = args.habitualValue
  const rest = Math.max(
    0,
    total - rental - home - args.invested - args.unparked - args.parked
  )
  const landlord =
    (total > 0 && rental / total >= 0.35) || (args.properties >= 3 && rental > 0)
  const profile: MixProfile = landlord ? 'landlord' : 'financial'
  const bands = landlord ? LANDLORD_BANDS : FINANCIAL_BANDS

  const sleeves: MixSleeve[] = [
    makeSleeve('real_estate', 'Alquiler', rental, total, bands.realEstate),
    makeSleeve('home', 'Uso propio', home, total, null),
    makeSleeve('invested', 'Fondos', args.invested, total, bands.invested),
    makeSleeve('cash', 'Efectivo', args.unparked, total, null),
    makeSleeve('parked', 'Apartado', args.parked, total, null),
    makeSleeve('rest', 'Resto', rest, total, null),
  ]

  const deploy = Math.max(0, Math.min(args.deployable, args.unparked))
  const afterInvested = args.invested + deploy
  const afterCash = Math.max(0, args.unparked - deploy)

  const brickSleeve = sleeves.find(s => s.id === 'real_estate')!
  const fundSleeve = sleeves.find(s => s.id === 'invested')!
  const brickOverEur = brickSleeve.deltaPts > 0 ? brickSleeve.gapEur : 0
  const fundsShortEur = fundSleeve.deltaPts < 0 ? fundSleeve.gapEur : 0

  return {
    profile,
    sleeves,
    afterDeploy: {
      realEstatePct: sharePct(rental, total),
      investedPct: sharePct(afterInvested, total),
      cashPct: sharePct(afterCash + args.parked, total),
    },
    brickOverEur,
    fundsShortEur,
    closableNow: Math.min(deploy, fundsShortEur),
  }
}

export function mixAnalysis(args: {
  assets: Asset[]
  buckets: MoneyBuckets
  re: RealEstateYield
  invested: number
  monthlyExpenses: number
  monthlyNetPassive: number
  deployable: number
}): MixAnalysis {
  const { buckets, re, invested, monthlyExpenses, monthlyNetPassive, deployable } = args
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

  const target = mixTarget({
    totalAssets,
    realEstate: re.value,
    rentalValue: re.rentalValue,
    habitualValue: re.habitualValue,
    properties: re.properties,
    invested,
    unparked: buckets.unparked,
    parked: buckets.parked,
    deployable,
  })
  const rentalPct = sharePct(re.rentalValue, totalAssets)
  const brickBand = target.profile === 'landlord' ? LANDLORD_BANDS.realEstate : FINANCIAL_BANDS.realEstate
  const fundBand = target.profile === 'landlord' ? LANDLORD_BANDS.invested : FINANCIAL_BANDS.invested

  let stance: MixStance = 'ok'
  let headline: string
  let detail: string
  let line: string

  if (totalAssets <= 0) {
    stance = 'ok'
    headline = 'Sin patrimonio no hay mezcla que juzgar.'
    detail = 'Añade cuentas, fondos o inmuebles.'
    line = 'Añade lo que tienes.'
  } else if (re.properties === 0) {
    stance = 'ok'
    const short = target.fundsShortEur
    headline =
      short > 0
        ? `Fondos ${investedPct}% — banda sana ${fundBand.min}–${fundBand.max}%.`
        : `Fondos ${investedPct}% — dentro de banda.`
    detail =
      short > 0
        ? `Faltan ${formatEur(short)} de fondos para entrar en banda. El efectivo que no es colchón va ahí.`
        : 'La mezcla financiera está en rango.'
    line =
      short > 0
        ? `Fondos por debajo de ${fundBand.min}–${fundBand.max}%.`
        : 'Mezcla dentro de banda.'
  } else if (!(monthlyExpenses > 0)) {
    stance = 'unknown'
    headline = `Alquiler ${rentalPct}% · todo el ladrillo ${realEstatePct}%.`
    detail = `Banda de renta ${brickBand.min}–${brickBand.max}%. Fondos ${investedPct}%. Sin tu gasto no se sabe si el efectivo aguanta un parón. No vendas hasta saberlo.`
    line = `Alquiler ${rentalPct}% (banda ${brickBand.min}–${brickBand.max}%). Falta el gasto mensual.`
  } else if (shockMonths != null && shockMonths < 6) {
    stance = 'divest_brick'
    headline = `El efectivo no llega a 6 meses si el alquiler para.`
    detail = `Alquiler ${rentalPct}% · ladrillo total ${realEstatePct}%. Aquí sí: vender vacíos. Aportar a fondos dejaría aún menos colchón.`
    line = 'Ladrillo de más y el efectivo no aguanta un parón.'
  } else if (shockMonths != null && shockMonths < shockTargetMonths && re.vacant >= 2) {
    stance = 'divest_brick'
    headline = `Alquiler ${rentalPct}% · ${re.vacant} vacíos · ${shockMonths} meses de golpe.`
    detail = `Con tanto inmueble el colchón de parón son ${shockTargetMonths} meses. Los vacíos son los que se venden; lo alquilado, no.`
    line = `Alquiler ${rentalPct}% y ${re.vacant} vacíos. El golpe no está cubierto.`
  } else if (target.brickOverEur > 0 || target.fundsShortEur > 0) {
    stance = 'rebalance_with_cash'
    const rentBit =
      target.brickOverEur > 0
        ? `Alquiler ${rentalPct}% — por encima de ${brickBand.min}–${brickBand.max}%.`
        : `Alquiler ${rentalPct}% — dentro de banda.`
    headline = `${rentBit} No vender.`
    detail =
      target.fundsShortEur > 0
        ? `El efectivo aguanta ${shockMonths ?? '—'} meses. Faltan ${formatEur(target.fundsShortEur)} de fondos para la banda ${fundBand.min}–${fundBand.max}%. El idle cubre ${formatEur(target.closableNow)}. Uso propio y lo que ya alquila no se venden para cerrar el hueco.`
        : `El efectivo aguanta ${shockMonths ?? '—'} meses. Equilibrio = sobrante a fondos, no deshacer pisos.`
    line =
      target.closableNow > 0
        ? `${rentBit} No vender. ${formatEur(target.closableNow, true)} a fondos.`
        : `${rentBit} No vender.`
  } else {
    stance = 'ok'
    headline = `Alquiler ${rentalPct}% · fondos ${investedPct}%.`
    detail =
      shockMonths != null
        ? `El efectivo cubre ${shockMonths} meses si el alquiler para. Ladrillo total ${realEstatePct}%.`
        : `Banda renta ${brickBand.min}–${brickBand.max}% · fondos ${fundBand.min}–${fundBand.max}%.`
    line = `Alquiler ${rentalPct}% · fondos ${investedPct}%.`
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
    line,
    target,
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
  return Math.max(0, buckets.toInvest)
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
    deployable,
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

  if (buckets.toInvest > 0) {
    questions.push({
      id: 'idle_cash',
      prompt: `Hay ${formatEur(buckets.toInvest)} que no son colchón ni un apartado. ¿Van a fondos, o tienen un motivo (reforma, juicio, impuestos…)?`,
      why: 'Solo hay dos razones para dejar efectivo: colchón de vida, o un gasto concreto. Una cuenta remunerada no es invertirlo.',
    })
  }

  const parkedBlank = parkedWithoutReason(assets)
  if (parkedBlank.length > 0) {
    const names = parkedBlank.map(a => a.name).join(', ')
    questions.push({
      id: 'parked_reason',
      prompt: `¿Para qué está apartado el dinero de ${names}? (reforma, juicio, impuestos, entrada…)`,
      why: 'Sin motivo concreto no está apartado: sobra, y sobra debería estar invertido.',
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
      detail: 'Se queda en efectivo. Puede estar en cuenta remunerada; eso no lo convierte en inversión.',
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
      detail: 'Se queda en efectivo. Puede estar remunerado. Márcalo como colchón para no mezclarlo con lo que va a fondos.',
    })
  }

  if (deployable > 0 && mix.stance !== 'divest_brick') {
    actions.push({
      id: 'deploy_idle',
      title: 'El sobrante tiene que invertirse',
      detail: `${formatEur(deployable)} no son colchón ni un apartado. A fondos. Una TAE de cuenta no cuenta.`,
    })
    moves.push({
      id: 'deploy_idle',
      stance: 'deploy',
      amount: Math.round(deployable),
      title: buckets.emergencyAssumed
        ? 'Sobrante de cuentas → fondos'
        : 'Ni colchón ni apartado → fondos',
      detail:
        mix.stance === 'rebalance_with_cash'
          ? 'Eso equilibra el ladrillo sin vender pisos. TAE de cuenta no es invertirlo.'
          : invested > 0
            ? 'Aportar a lo que ya está invertido. TAE de cuenta no cuenta como fondo.'
            : 'A fondos. No hace falta elegir el producto aquí.',
    })
  } else if (buckets.toInvest > 0 && !(buckets.emergencyAssumed && emergencyGap > 0) && monthlyExpenses <= 0) {
    actions.push({
      id: 'assign_idle',
      title: 'Parte el efectivo: colchón, apartado, o fondos',
      detail: `${formatEur(buckets.toInvest)} sin motivo. O es colchón, o está apartado (reforma, juicio…), o va a fondos.`,
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
    headline = `El colchón está. ${formatEur(deployable)} no tienen motivo: a fondos.`
  } else if (buckets.toInvest > 0) {
    headline = `El colchón está. ${formatEur(buckets.toInvest)} deberían estar invertidos.`
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
