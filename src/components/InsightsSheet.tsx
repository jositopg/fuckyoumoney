import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import type { Asset, WealthSnapshot, RealEstateMetadata, CashMetadata, DebtMetadata } from '../types'
import {
  getAutonomyMonths,
  getLiquidAssets,
  getTotalPositiveAssets,
  getTotalMonthlyDebtPayments,
  formatEur,
} from '../utils/calculations'



interface InsightsSheetProps {
  isOpen: boolean
  onClose: () => void
  assets: Asset[]
  monthlyExpenses: number
  snapshots?: WealthSnapshot[]
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide mb-3">
      {children}
    </h3>
  )
}

function AutonomyGauge({ months }: { months: number }) {
  const target = 24
  const progress = Math.min(isFinite(months) && months > 0 ? months / target : 0, 1)
  const displayMonths = isFinite(months) && months >= 0 ? Math.round(months * 10) / 10 : 0

  let levelLabel = 'Sin datos'
  if (isFinite(months) && months >= 0) {
    if (months < 3) levelLabel = 'Construyendo base'
    else if (months < 6) levelLabel = 'Colchón sólido'
    else if (months < 12) levelLabel = 'Margen real'
    else if (months < 24) levelLabel = 'Autonomía'
    else levelLabel = 'Libertad'
  }

  return (
    <div className="flex flex-col items-center py-4">
      <svg viewBox="0 0 200 110" className="w-full max-w-[240px]">
        {/* Background arc */}
        <path
          d="M 20,100 A 80,80 0 0,1 180,100"
          fill="none"
          stroke="#f1f4f4"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d="M 20,100 A 80,80 0 0,1 180,100"
          fill="none"
          stroke="#466649"
          strokeWidth="14"
          strokeLinecap="round"
          pathLength="251.3"
          strokeDasharray="251.3"
          strokeDashoffset={251.3 * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        {/* Main number */}
        <text
          x="100"
          y="88"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="#1a2020"
          fontFamily="var(--font-display, sans-serif)"
        >
          {displayMonths}
        </text>
        {/* Label */}
        <text
          x="100"
          y="106"
          textAnchor="middle"
          fontSize="11"
          fill="#1a2020"
          opacity="0.5"
          fontFamily="var(--font-body, sans-serif)"
        >
          meses
        </text>
      </svg>
      <p className="text-label-sm text-on-surface/50 font-body mt-1">{levelLabel}</p>
      <p className="text-label-sm text-on-surface/30 font-body">objetivo: 24 meses</p>
    </div>
  )
}

function AllocationDonut({ assets }: { assets: Asset[] }) {
  const categories = ['cash', 'stocks', 'crypto', 'commodities', 'real_estate', 'vehicles', 'pension'] as const
  const colors: Record<string, string> = {
    cash: '#466649',
    stocks: '#3a5a3e',
    crypto: '#c4e8c2',
    commodities: '#d4a836',
    real_estate: '#dfe3e7',
    vehicles: '#abb4b5',
    pension: '#dbe4e5',
  }
  const labels: Record<string, string> = {
    cash: 'Efectivo',
    stocks: 'Acciones/ETFs',
    crypto: 'Cripto',
    commodities: 'Metales',
    real_estate: 'Inmuebles',
    vehicles: 'Vehículos',
    pension: 'Pensión',
  }

  const totalPositive = assets.filter(a => a.category !== 'debt').reduce((s, a) => s + a.value, 0)
  if (totalPositive <= 0) return null

  const segments = categories
    .map(cat => ({
      cat,
      value: assets.filter(a => a.category === cat).reduce((s, a) => s + a.value, 0),
      color: colors[cat],
      label: labels[cat],
    }))
    .filter(s => s.value > 0)

  const r = 60, cx = 80, cy = 80
  const circumference = 2 * Math.PI * r

  let offset = 0
  const startOffset = circumference * 0.25 // rotate to start from top

  return (
    <div>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 160 160" className="w-36 h-36 flex-shrink-0">
          {segments.map((seg, i) => {
            const dash = (seg.value / totalPositive) * circumference
            const segOffset = circumference - offset + startOffset
            offset += dash
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="20"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={segOffset}
              />
            )
          })}
          {/* Center hole */}
          <circle cx={cx} cy={cy} r={r - 10} fill="#f8f9f9" />
        </svg>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          {segments.map(seg => (
            <div key={seg.cat} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-label-sm text-on-surface/70 font-body flex-1">{seg.label}</span>
              <span className="text-label-sm font-semibold text-on-surface font-body tabular-nums">
                {Math.round((seg.value / totalPositive) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EvolutionChart({ snapshots }: { snapshots: WealthSnapshot[] }) {
  if (snapshots.length < 2)
    return (
      <p className="text-label text-on-surface/40 font-body py-4 text-center">
        Abre la app el próximo mes para ver tu evolución
      </p>
    )

  const values = snapshots.map(s => s.netWorth)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 300, h = 80, padX = 0, padY = 8

  const pts = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * (w - padX * 2),
    y: padY + (1 - (v - min) / range) * (h - padY * 2),
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height: '80px' }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#466649" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#466649" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke="#466649"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={pts[0].x} cy={pts[0].y} r="3" fill="#466649" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill="#466649" />
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-label-sm text-on-surface/40 font-body">
          {monthNames[new Date(snapshots[0].date).getMonth()]}
        </span>
        <span className="text-label-sm text-on-surface/40 font-body">
          {monthNames[new Date(snapshots[snapshots.length - 1].date).getMonth()]}
        </span>
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-label-sm font-semibold text-on-surface/60 font-body tabular-nums">
          {formatEur(values[0], true)}
        </span>
        <span
          className={`text-label-sm font-semibold font-body tabular-nums ${
            values[values.length - 1] >= values[0] ? 'text-primary' : 'text-error'
          }`}
        >
          {formatEur(values[values.length - 1], true)}
        </span>
      </div>
    </div>
  )
}

function KeyRatios({ assets, monthlyExpenses }: { assets: Asset[]; monthlyExpenses: number }) {
  const totalPositive = getTotalPositiveAssets(assets)
  const liquidAssets = getLiquidAssets(assets)
  const monthlyDebtPayments = getTotalMonthlyDebtPayments(assets)

  const liquidityPct = totalPositive > 0 ? Math.round((liquidAssets / totalPositive) * 100) : 0
  const liquidityLabel =
    liquidityPct >= 50 ? 'Líquido' : liquidityPct >= 25 ? 'Semi-líquido' : 'Poco líquido'

  const commitmentPct =
    monthlyExpenses > 0 && monthlyDebtPayments > 0
      ? Math.round((monthlyDebtPayments / monthlyExpenses) * 100)
      : 0

  const topAsset = assets
    .filter(a => a.category !== 'debt')
    .sort((a, b) => b.value - a.value)[0]

  const realEstateAssets = assets.filter(a => a.category === 'real_estate')
  const rentableAssets = realEstateAssets.filter(a => {
    const meta = a.metadata as RealEstateMetadata | undefined
    return (meta?.monthlyRent ?? 0) > 0
  })
  const hasRentalYield = rentableAssets.length > 0
  const rentalYield = hasRentalYield
    ? (() => {
        const annual = rentableAssets.reduce((s, a) => {
          const meta = a.metadata as RealEstateMetadata | undefined
          if (meta?.ttmNetCashflow != null && meta.ttmNetCashflow !== 0) return s + meta.ttmNetCashflow
          return s + (meta?.monthlyRent ?? 0) * 12
        }, 0)
        const propValue = rentableAssets.reduce((s, a) => s + a.value, 0)
        return propValue > 0 ? Math.round((annual / propValue) * 100 * 10) / 10 : 0
      })()
    : null

  const illiquidPct =
    totalPositive > 0
      ? Math.round(
          (assets
            .filter(a => a.category === 'real_estate' || a.category === 'vehicles')
            .reduce((s, a) => s + a.value, 0) /
            totalPositive) *
            100
        )
      : 0

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Liquidez */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
        <p className="text-label text-on-surface/60 font-body mb-1">Liquidez</p>
        <p className="text-headline font-display font-semibold text-on-surface">{liquidityPct}%</p>
        <p className="text-label-sm text-on-surface/50 font-body mt-0.5">
          {liquidityLabel} · {liquidityPct}% líquido
        </p>
      </div>

      {/* Compromiso mensual */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
        <p className="text-label text-on-surface/60 font-body mb-1">Compromiso mensual</p>
        {monthlyExpenses > 0 && commitmentPct > 0 ? (
          <>
            <p className="text-headline font-display font-semibold text-on-surface">{commitmentPct}%</p>
            <p className="text-label-sm text-on-surface/50 font-body mt-0.5">
              van a deuda
            </p>
          </>
        ) : (
          <>
            <p className="text-headline font-display font-semibold text-primary">—</p>
            <p className="text-label-sm text-on-surface/50 font-body mt-0.5">Sin compromisos fijos</p>
          </>
        )}
      </div>

      {/* Activo más valioso */}
      {topAsset && (
        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
          <p className="text-label text-on-surface/60 font-body mb-1">Activo principal</p>
          <p
            className="text-headline font-display font-semibold text-on-surface truncate"
            title={topAsset.name}
          >
            {topAsset.name.length > 14 ? topAsset.name.slice(0, 13) + '…' : topAsset.name}
          </p>
          <p className="text-label-sm text-on-surface/50 font-body mt-0.5">
            {formatEur(topAsset.value, true)}
          </p>
        </div>
      )}

      {/* Rentabilidad alquiler / Patrimonio ilíquido */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
        {hasRentalYield ? (
          <>
            <p className="text-label text-on-surface/60 font-body mb-1">Rentab. alquiler</p>
            <p className="text-headline font-display font-semibold text-on-surface">{rentalYield}%</p>
            <p className="text-label-sm text-on-surface/50 font-body mt-0.5">rendimiento anual</p>
          </>
        ) : (
          <>
            <p className="text-label text-on-surface/60 font-body mb-1">Patrimonio ilíquido</p>
            <p className="text-headline font-display font-semibold text-on-surface">{illiquidPct}%</p>
            <p className="text-label-sm text-on-surface/50 font-body mt-0.5">inmuebles y vehículos</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Passive Income vs Expenses ────────────────────────────────────────────────

function PassiveIncomePanel({ assets, monthlyExpenses }: { assets: Asset[]; monthlyExpenses: number }) {
  const rentalIncome = assets
    .filter(a => a.category === 'real_estate')
    .reduce((s, a) => s + ((a.metadata as RealEstateMetadata | undefined)?.monthlyRent ?? 0), 0)

  const rentalNetMonthly = assets
    .filter(a => a.category === 'real_estate')
    .reduce((s, a) => s + ((a.metadata as RealEstateMetadata | undefined)?.ttmNetCashflow ?? 0), 0) / 12

  const interestIncome = assets
    .filter(a => a.category === 'cash')
    .reduce((s, a) => {
      const meta = a.metadata as CashMetadata | undefined
      const rate = meta?.interestRate ?? 0
      return rate > 0 ? s + (a.value * rate) / 100 / 12 : s
    }, 0)

  const totalPassive = rentalNetMonthly + interestIncome
  const totalGross = rentalIncome + interestIncome
  if (totalGross <= 0 && totalPassive <= 0) return null

  const coveragePct = monthlyExpenses > 0 ? Math.min((totalPassive / monthlyExpenses) * 100, 100) : 0
  const coverageRounded = Math.round(coveragePct)
  const covered = totalPassive >= monthlyExpenses

  const sources = [
    rentalNetMonthly !== 0 && { icon: '🏠', label: 'Inmuebles neto', monthly: rentalNetMonthly },
    rentalIncome > 0 &&
      rentalNetMonthly === 0 && { icon: '🏠', label: 'Alquiler bruto', monthly: rentalIncome },
    interestIncome > 0 && { icon: '🏦', label: 'Intereses', monthly: interestIncome },
  ].filter(Boolean) as { icon: string; label: string; monthly: number }[]

  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-soft">
      <p className="text-label font-semibold text-on-surface font-body mb-3">Renta pasiva mensual</p>

      <div className="space-y-2 mb-3">
        {sources.map(src => (
          <div key={src.label} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">{src.icon}</span>
              <span className="text-label text-on-surface/60 font-body">{src.label}</span>
            </div>
            <span className="text-label font-semibold text-on-surface font-body tabular-nums">
              +{formatEur(Math.round(src.monthly))}/mes
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-surface-container-highest">
          <span className="text-label font-semibold text-on-surface font-body">Total</span>
          <span className="text-label font-semibold text-primary font-body tabular-nums">
            {formatEur(Math.round(totalPassive || totalGross))}/mes neto
          </span>
        </div>
      </div>

      {monthlyExpenses > 0 && (
        <>
          <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${covered ? 'bg-primary' : 'bg-primary/60'}`}
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          <p className={`text-label-sm font-body ${covered ? 'text-primary font-semibold' : 'text-on-surface/50'}`}>
            {covered
              ? 'Tu renta pasiva cubre todos tus gastos — independencia financiera real'
              : `Cubre el ${coverageRounded}% de tus gastos mensuales`}
          </p>
        </>
      )}
    </div>
  )
}

// ── Debt Calculator ───────────────────────────────────────────────────────────

function calcPayoff(
  balance: number,
  annualRate: number,
  monthlyPayment: number
): { months: number; totalInterest: number } | null {
  if (balance <= 0 || monthlyPayment <= 0) return null
  const r = annualRate / 100 / 12
  if (r === 0) return { months: balance / monthlyPayment, totalInterest: 0 }
  if (monthlyPayment <= balance * r) return null // payment doesn't even cover interest
  const months = Math.log(monthlyPayment / (monthlyPayment - balance * r)) / Math.log(1 + r)
  return { months, totalInterest: Math.max(0, monthlyPayment * months - balance) }
}

function DebtCalculator({ assets }: { assets: Asset[] }) {
  const [extraPayment, setExtraPayment] = useState('100')

  const debts = assets
    .filter(a => a.category === 'debt' && a.value > 0)
    .map(a => {
      const meta = a.metadata as DebtMetadata | undefined
      return {
        id: a.id,
        name: a.name,
        balance: a.value,
        annualRate: meta?.interestRate ?? 0,
        monthlyPayment: meta?.monthlyPayment ?? 0,
        debtType: meta?.debtType,
      }
    })
    .filter(d => d.monthlyPayment > 0)

  if (debts.length === 0) return null

  const extra = Math.max(0, parseFloat(extraPayment) || 0)

  const rows = debts.map(d => {
    const base = calcPayoff(d.balance, d.annualRate, d.monthlyPayment)
    const withExtra = extra > 0 ? calcPayoff(d.balance, d.annualRate, d.monthlyPayment + extra) : null
    return { ...d, base, withExtra }
  })

  const totalInterestNow = rows.reduce((s, r) => s + (r.base?.totalInterest ?? 0), 0)
  const totalInterestWithExtra = rows.reduce((s, r) => s + (r.withExtra?.totalInterest ?? r.base?.totalInterest ?? 0), 0)
  const interestSaved = totalInterestNow - totalInterestWithExtra
  const maxMonthsNow = Math.max(...rows.map(r => r.base?.months ?? 0))
  const maxMonthsWithExtra = Math.max(...rows.map(r => (extra > 0 ? r.withExtra?.months : r.base?.months) ?? 0))
  const monthsSaved = Math.round(maxMonthsNow - maxMonthsWithExtra)

  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-soft space-y-4">
      <p className="text-label font-semibold text-on-surface font-body">Calculadora de deudas</p>

      {/* Per-debt rows */}
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.id} className="bg-surface-container-low rounded-xl p-3">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-label font-semibold text-on-surface font-body leading-tight">{row.name}</p>
              <span className="text-label-sm text-on-surface/50 font-body tabular-nums flex-shrink-0">
                {formatEur(row.balance, true)}
              </span>
            </div>
            {row.base ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span className="text-label-sm text-on-surface/50 font-body">Cuota actual</span>
                <span className="text-label-sm font-semibold text-on-surface font-body tabular-nums text-right">
                  {formatEur(row.monthlyPayment)}/mes
                </span>
                <span className="text-label-sm text-on-surface/50 font-body">Plazo estimado</span>
                <span className="text-label-sm font-semibold text-on-surface font-body tabular-nums text-right">
                  {Math.ceil(row.base.months)} meses
                </span>
                {row.annualRate > 0 && (
                  <>
                    <span className="text-label-sm text-on-surface/50 font-body">Intereses totales</span>
                    <span className="text-label-sm font-semibold text-error font-body tabular-nums text-right">
                      {formatEur(Math.round(row.base.totalInterest))}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <p className="text-label-sm text-on-surface/40 font-body">Añade cuota mensual para calcular</p>
            )}
          </div>
        ))}
      </div>

      {/* Extra payment input */}
      <div className="flex items-center gap-3">
        <span className="text-label text-on-surface/60 font-body flex-shrink-0">Pago extra</span>
        <div className="relative flex-1">
          <input
            type="number"
            inputMode="decimal"
            value={extraPayment}
            onChange={e => setExtraPayment(e.target.value)}
            className="w-full bg-surface-container-highest text-on-surface rounded-xl px-3 pr-14 py-2.5
              font-body text-label text-right focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            min="0"
            step="50"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface/40 text-label font-body pointer-events-none">
            €/mes
          </span>
        </div>
      </div>

      {/* Savings summary */}
      {extra > 0 && interestSaved > 0 && (
        <div className="bg-primary-container/40 rounded-xl px-4 py-3 space-y-1">
          <p className="text-label text-on-surface/70 font-body leading-relaxed">
            Añadiendo <strong>{formatEur(extra)}/mes</strong> extra ahorrarías{' '}
            <strong className="text-primary">{formatEur(Math.round(interestSaved))}</strong> en intereses
            {monthsSaved > 0 && (
              <> y liquidarías tus deudas <strong className="text-primary">{monthsSaved} meses antes</strong></>
            )}.
          </p>
        </div>
      )}
      {extra > 0 && interestSaved <= 0 && (
        <div className="bg-surface-container-low rounded-xl px-4 py-3">
          <p className="text-label-sm text-on-surface/50 font-body">
            {monthsSaved > 0
              ? `Liquidarías tus deudas ${monthsSaved} meses antes.`
              : 'Sin intereses pendientes — cualquier pago extra reduce el plazo directamente.'}
          </p>
        </div>
      )}
    </div>
  )
}

function WhatIfCalculator({ assets, monthlyExpenses }: { assets: Asset[]; monthlyExpenses: number }) {
  const [extraSavings, setExtraSavings] = useState('200')

  if (monthlyExpenses <= 0) return null

  const currentMonths = getAutonomyMonths(assets, monthlyExpenses)
  const extra = parseFloat(extraSavings) || 0
  const monthsGainedIn12 = extra > 0 ? (extra * 12) / monthlyExpenses : 0
  const monthsGainedIn12Rounded = Math.round(monthsGainedIn12 * 10) / 10

  return (
    <div className="bg-surface-container-low rounded-xl p-4">
      <p className="text-label font-semibold text-on-surface font-body mb-3">¿Y si...?</p>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-label text-on-surface/60 font-body flex-shrink-0">Si ahorras</span>
        <div className="relative flex-1">
          <input
            type="number"
            inputMode="decimal"
            value={extraSavings}
            onChange={e => setExtraSavings(e.target.value)}
            className="w-full bg-surface-container-highest text-on-surface rounded-xl px-3 pr-14 py-2.5
              font-body text-label text-right focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            min="0"
            step="50"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface/40 text-label font-body pointer-events-none">
            €/mes
          </span>
        </div>
      </div>
      {extra > 0 && (
        <div className="bg-primary-container/40 rounded-xl px-4 py-3">
          <p className="text-label text-on-surface/70 font-body leading-relaxed">
            En <strong>12 meses</strong> ganarías{' '}
            <strong className="text-primary">{monthsGainedIn12Rounded} meses</strong> más de autonomía.
            {isFinite(currentMonths) && currentMonths >= 0 && (
              <>
                {' '}
                Pasarías de <strong>{Math.round(currentMonths * 10) / 10}</strong> a{' '}
                <strong className="text-primary">
                  {Math.round((currentMonths + monthsGainedIn12) * 10) / 10} meses
                </strong>
                .
              </>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

export function InsightsSheet({ isOpen, onClose, assets, monthlyExpenses, snapshots }: InsightsSheetProps) {
  const hasAssets = assets.length > 0
  const autonomyMonths = getAutonomyMonths(assets, monthlyExpenses)

  const hasPassiveIncome = assets.some(a => {
    if (a.category === 'real_estate') {
      const m = a.metadata as RealEstateMetadata | undefined
      return (m?.monthlyRent ?? 0) > 0 || (m?.ttmNetCashflow ?? 0) !== 0
    }
    if (a.category === 'cash') return ((a.metadata as CashMetadata | undefined)?.interestRate ?? 0) > 0
    return false
  })
  const hasDebtsWithPayment = assets.some(
    a => a.category === 'debt' && a.value > 0 && ((a.metadata as DebtMetadata | undefined)?.monthlyPayment ?? 0) > 0
  )

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Análisis">
      <div className="space-y-8 mt-2 pb-4">
        {/* Autonomy gauge */}
        {hasAssets && monthlyExpenses > 0 && (
          <section>
            <SectionHeader>Autonomía</SectionHeader>
            <AutonomyGauge months={autonomyMonths} />
          </section>
        )}

        {/* Asset allocation */}
        {hasAssets && (
          <section>
            <SectionHeader>Distribución de activos</SectionHeader>
            <AllocationDonut assets={assets} />
          </section>
        )}

        {/* Evolution chart */}
        <section>
          <SectionHeader>Evolución del patrimonio</SectionHeader>
          <EvolutionChart snapshots={snapshots ?? []} />
        </section>

        {/* Key ratios */}
        {hasAssets && (
          <section>
            <SectionHeader>Ratios clave</SectionHeader>
            <KeyRatios assets={assets} monthlyExpenses={monthlyExpenses} />
          </section>
        )}

        {/* Passive income */}
        {hasAssets && hasPassiveIncome && (
          <section>
            <SectionHeader>Renta pasiva</SectionHeader>
            <PassiveIncomePanel assets={assets} monthlyExpenses={monthlyExpenses} />
          </section>
        )}

        {/* Debt calculator */}
        {hasAssets && hasDebtsWithPayment && (
          <section>
            <SectionHeader>Deudas</SectionHeader>
            <DebtCalculator assets={assets} />
          </section>
        )}

        {/* What if */}
        {hasAssets && monthlyExpenses > 0 && (
          <section>
            <WhatIfCalculator assets={assets} monthlyExpenses={monthlyExpenses} />
          </section>
        )}


      </div>
    </BottomSheet>
  )
}
