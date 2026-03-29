import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import type { Asset, WealthSnapshot, RealEstateMetadata } from '../types'
import {
  getAutonomyMonths,
  getLiquidAssets,
  getTotalPositiveAssets,
  getTotalDebts,
  getTotalMonthlyDebtPayments,
  getEmergencyFundMonths,
  getDebtRatio,
  formatEur,
} from '../utils/calculations'

// ── Wisdom Pills ──────────────────────────────────────────────────────────────

interface WisdomPill {
  id: string
  icon: string
  title: string
  body: string
  // If set, this pill is shown first when the condition is true for the user
  relevantWhen?: (ctx: WisdomContext) => boolean
}

interface WisdomContext {
  debtRatio: number
  emergencyMonths: number
  liquidPct: number
  hasDebts: boolean
  hasInvestments: boolean
  autonomyMonths: number
}

const WISDOM_PILLS: WisdomPill[] = [
  {
    id: 'assets-vs-liabilities',
    icon: '⚖️',
    title: 'Activo vs Pasivo',
    body: 'Un activo pone dinero en tu bolsillo. Un pasivo te lo saca. Tu coche, aunque lo hayas pagado, es un pasivo: seguros, gasolina, mantenimiento. Tu piso en alquiler es un activo: genera ingresos mes a mes. La clave no es acumular cosas, es acumular cosas que produzcan.',
  },
  {
    id: 'good-debt-bad-debt',
    icon: '🏦',
    title: 'Deuda buena vs deuda mala',
    body: 'No toda deuda es mala. La diferencia está en lo que financias. Endeudarte para comprar un activo que genera más de lo que pagas de intereses es deuda buena. Endeudarte para pagar vacaciones o un coche que se deprecia es deuda mala. Pregúntate siempre: ¿esto pone dinero en mi bolsillo o me lo quita?',
    relevantWhen: ctx => ctx.debtRatio > 0.3,
  },
  {
    id: 'emergency-fund',
    icon: '🛡️',
    title: 'El colchón de emergencia',
    body: 'Antes de invertir, necesitas entre 3 y 6 meses de gastos en activos líquidos (efectivo o equivalente). No es rentable, no crece, pero te protege de tomar malas decisiones cuando la vida se complica. Un coche que se rompe, una obra en casa, un mes sin trabajo — sin colchón, todo se convierte en deuda.',
    relevantWhen: ctx => ctx.emergencyMonths < 3 && ctx.emergencyMonths >= 0,
  },
  {
    id: 'compound-interest',
    icon: '📈',
    title: 'El interés compuesto',
    body: 'Invertir 200€ al mes durante 30 años al 7% produce más de 240.000€. Pero los primeros 10 años apenas se nota. El interés compuesto es aburrido hasta que de repente no lo es. El tiempo en el mercado es el activo más valioso que tienes — más que el capital inicial.',
    relevantWhen: ctx => ctx.hasInvestments,
  },
  {
    id: 'rat-race',
    icon: '🐀',
    title: 'La carrera de la rata',
    body: 'Trabajas para ganar dinero, gastas ese dinero, necesitas más dinero, trabajas más. Ese ciclo se llama la carrera de la rata. La salida no es ganar más — es que tu dinero trabaje para ti. Cada activo que adquieres es un empleado que trabaja mientras tú duermes.',
  },
  {
    id: 'liquidity',
    icon: '💧',
    title: 'La trampa de la iliquidez',
    body: 'Tener patrimonio no es lo mismo que tener liquidez. Un piso valorado en 300.000€ no te sirve para pagar la factura del mes. El patrimonio ilíquido tiene valor, pero no libertad. Mantén siempre una parte de tus activos en algo que puedas convertir en efectivo en menos de 48 horas.',
    relevantWhen: ctx => ctx.liquidPct < 20,
  },
  {
    id: 'opportunity-cost',
    icon: '🔄',
    title: 'El coste de oportunidad',
    body: 'Cada euro tiene un precio oculto: el uso alternativo que no le das. Gastar 500€ en algo que no necesitas no son solo 500€ — son también los intereses que habrían generado, las opciones que habrías comprado. El coste real de una compra es lo que dejas de hacer con ese dinero.',
  },
  {
    id: 'pay-yourself-first',
    icon: '💰',
    title: 'Págate primero a ti',
    body: 'La mayoría ahorra lo que sobra al final del mes. El problema es que no suele sobrar nada. El truco es al revés: en cuanto cobres, aparta lo que quieres ahorrar antes de pagar nada. Lo que no ves, no lo gastas. El ahorro automático elimina la fuerza de voluntad de la ecuación.',
  },
  {
    id: 'diversification',
    icon: '🗂️',
    title: 'Diversificación: no una cesta, varias',
    body: 'Concentrar más del 70% de tu patrimonio en un solo tipo de activo es un riesgo innecesario. Los inmuebles pueden bajar, la bolsa puede caer, la cripto puede colapsar. Lo que rara vez ocurre es que todo caiga a la vez. Distribuir no reduce la rentabilidad — reduce la volatilidad de tu vida.',
  },
  {
    id: 'inflation',
    icon: '📉',
    title: 'El dinero parado pierde valor',
    body: 'Con una inflación del 3% anual, 10.000€ en efectivo valen 7.400€ en poder adquisitivo diez años después. El dinero que no inviertes no está seguro — está perdiendo. Mantener efectivo para el colchón tiene sentido; tenerlo todo en cuenta corriente es una pérdida silenciosa.',
  },
  {
    id: 'income-streams',
    icon: '🌊',
    title: 'Fuentes de ingreso múltiples',
    body: 'Un único ingreso es frágil: si desaparece, desaparece todo. Los activos que generan renta pasiva — dividendos, alquiler, intereses — son una segunda fuente que no depende de que tú trabajes ese mes. No hace falta que sea grande; hace falta que exista.',
    relevantWhen: ctx => ctx.autonomyMonths < 6,
  },
  {
    id: 'net-worth-mindset',
    icon: '🧠',
    title: 'Patrimonio neto, no salario',
    body: 'El salario es lo que ganas. El patrimonio neto es lo que vales. Alguien que gana 30.000€ y ahorra el 20% construye más riqueza que alguien que gana 80.000€ y gasta todo. La riqueza no se mide en ingresos — se mide en lo que queda cuando paras de cobrar.',
  },
]

function WisdomPills({ assets, monthlyExpenses }: { assets: Asset[]; monthlyExpenses: number }) {
  const autonomyMonths = getAutonomyMonths(assets, monthlyExpenses)
  const totalDebts = getTotalDebts(assets)
  const emergencyMonths = getEmergencyFundMonths(assets, monthlyExpenses)
  const debtRatio = getDebtRatio(assets)
  const totalPositive = getTotalPositiveAssets(assets)
  const liquidAssets = getLiquidAssets(assets)
  const liquidPct = totalPositive > 0 ? (liquidAssets / totalPositive) * 100 : 100

  const ctx: WisdomContext = {
    debtRatio,
    emergencyMonths: isFinite(emergencyMonths) ? emergencyMonths : 999,
    liquidPct,
    hasDebts: totalDebts > 0,
    hasInvestments: assets.some(a => a.category === 'stocks' || a.category === 'crypto'),
    autonomyMonths: isFinite(autonomyMonths) ? autonomyMonths : 0,
  }

  // Sort: contextually relevant pills first, rest in original order
  const sorted = [...WISDOM_PILLS].sort((a, b) => {
    const aRelevant = a.relevantWhen?.(ctx) ?? false
    const bRelevant = b.relevantWhen?.(ctx) ?? false
    if (aRelevant && !bRelevant) return -1
    if (!aRelevant && bRelevant) return 1
    return 0
  })

  return (
    <div className="space-y-3">
      {sorted.map(pill => {
        const isRelevant = pill.relevantWhen?.(ctx) ?? false
        return (
          <div
            key={pill.id}
            className={`rounded-xl p-4 ${isRelevant ? 'bg-primary-container/30' : 'bg-surface-container-lowest'} shadow-soft`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5 flex-shrink-0">{pill.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-label font-semibold text-on-surface font-body mb-1.5">{pill.title}</p>
                <p className="text-label text-on-surface/60 font-body leading-relaxed">{pill.body}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

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
        const annualRent = rentableAssets.reduce((s, a) => {
          const meta = a.metadata as RealEstateMetadata | undefined
          return s + (meta?.monthlyRent ?? 0) * 12
        }, 0)
        const propValue = rentableAssets.reduce((s, a) => s + a.value, 0)
        return propValue > 0 ? Math.round((annualRent / propValue) * 100 * 10) / 10 : 0
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
            className="w-full bg-surface-container-highest text-on-surface rounded-xl px-3 py-2.5
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

        {/* What if */}
        {hasAssets && monthlyExpenses > 0 && (
          <section>
            <WhatIfCalculator assets={assets} monthlyExpenses={monthlyExpenses} />
          </section>
        )}

        {/* Wisdom pills */}
        <section>
          <SectionHeader>Píldoras de sabiduría</SectionHeader>
          <WisdomPills assets={assets} monthlyExpenses={monthlyExpenses} />
        </section>
      </div>
    </BottomSheet>
  )
}
