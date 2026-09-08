import { ChevronRight } from 'lucide-react'
import type { Asset, AssetCategory, CashMetadata, StocksMetadata, CryptoMetadata, RealEstateMetadata, VehicleMetadata, PensionMetadata, DebtMetadata, CommodityMetadata } from '../types'
import { formatEur } from '../utils/calculations'

interface AssetCardProps {
  asset: Asset
  onClick: () => void
}

const CATEGORY_ICONS: Record<AssetCategory, string> = {
  cash: '🏦',
  stocks: '📈',
  crypto: '₿',
  commodities: '🥇',
  real_estate: '🏠',
  vehicles: '🚗',
  pension: '🏖️',
  business: '🏢',
  receivable: '🤝',
  other: '📦',
  debt: '📉',
}

function getSecondaryLine(asset: Asset): string | null {
  const m = asset.metadata
  if (!m) return asset.symbol || null

  switch (asset.category) {
    case 'cash': {
      const cm = m as CashMetadata
      const parts = []
      if (cm.job === 'emergency') parts.push('Colchón')
      else if (cm.job === 'parked') parts.push(cm.parkedReason ? `Apartado · ${cm.parkedReason}` : 'Apartado')
      else parts.push('A invertir')
      if (cm.interestRate) parts.push(`${cm.interestRate}% TAE`)
      return parts.join(' · ') || null
    }
    case 'stocks': {
      const sm = m as StocksMetadata
      const parts = []
      // Prefer resolved ticker over raw ISIN for readability
      const displaySymbol = sm.resolvedTicker || asset.symbol
      if (displaySymbol) parts.push(displaySymbol)
      if (sm.quantity) parts.push(`${sm.quantity} u.`)
      if (sm.pricePerUnit) parts.push(formatEur(sm.pricePerUnit) + '/u')
      return parts.join(' · ') || null
    }
    case 'crypto': {
      const cm = m as CryptoMetadata
      const parts = []
      if (asset.symbol) parts.push(asset.symbol)
      if (cm.quantity) parts.push(`${cm.quantity}`)
      if (cm.wallet) parts.push(cm.wallet)
      return parts.join(' · ') || null
    }
    case 'real_estate': {
      const rm = m as RealEstateMetadata
      const typeLabels: Record<string, string> = {
        vivienda_habitual: 'Vivienda habitual', alquiler: 'En alquiler',
        local: 'Local', garaje: 'Garaje', terreno: 'Terreno', otro: 'Otro'
      }
      const parts = []
      if (rm.propertyType) parts.push(typeLabels[rm.propertyType] || '')
      if (rm.monthlyRent) parts.push(`${formatEur(rm.monthlyRent)} bruto/mes`)
      if (rm.ttmNetCashflow != null && rm.ttmNetCashflow !== 0) {
        parts.push(`${formatEur(Math.round(rm.ttmNetCashflow))} neto/año`)
      }
      return parts.join(' · ') || null
    }
    case 'vehicles': {
      const vm = m as VehicleMetadata
      const parts = []
      if (vm.vehicleType) parts.push(vm.vehicleType.charAt(0).toUpperCase() + vm.vehicleType.slice(1))
      if (vm.year) parts.push(vm.year.toString())
      return parts.join(' · ') || null
    }
    case 'pension': {
      const pm = m as PensionMetadata
      const parts = []
      if (pm.manager) parts.push(pm.manager)
      if (pm.monthlyContribution) parts.push(`${formatEur(pm.monthlyContribution)}/mes`)
      return parts.join(' · ') || null
    }
    case 'debt': {
      const dm = m as DebtMetadata
      const parts = []
      if (dm.monthlyPayment) parts.push(`${formatEur(dm.monthlyPayment)}/mes`)
      if (dm.interestRate) parts.push(`${dm.interestRate}% TIN`)
      return parts.join(' · ') || null
    }
    case 'commodities': {
      const cm = m as CommodityMetadata
      const typeLabels: Record<string, string> = {
        oro: 'Oro', plata: 'Plata', platino: 'Platino', paladio: 'Paladio', otro: 'Otro',
      }
      const parts = []
      if (cm.commodityType) parts.push(typeLabels[cm.commodityType] || '')
      if (cm.quantity && cm.unit) parts.push(`${cm.quantity} ${cm.unit}`)
      if (cm.pricePerUnit && cm.unit) parts.push(`${formatEur(cm.pricePerUnit)}/${cm.unit}`)
      return parts.join(' · ') || null
    }
    default: return null
  }
}

function getPnlPercent(asset: Asset): number | null {
  if (asset.category !== 'stocks' && asset.category !== 'crypto' && asset.category !== 'commodities') return null
  const m = asset.metadata as StocksMetadata | CryptoMetadata | CommodityMetadata | undefined
  if (!m) return null
  const { pricePerUnit, purchasePrice } = m
  if (!pricePerUnit || !purchasePrice || purchasePrice <= 0) return null
  return ((pricePerUnit - purchasePrice) / purchasePrice) * 100
}

export function AssetCard({ asset, onClick }: AssetCardProps) {
  const isDebt = asset.category === 'debt'
  const displayValue = isDebt ? -Math.abs(asset.value) : asset.value
  const secondaryLine = getSecondaryLine(asset)
  const pnl = getPnlPercent(asset)

  return (
    <button
      onClick={onClick}
      aria-label={`${asset.name}, ${formatEur(displayValue)}`}
      className="w-full flex items-center gap-3 py-3 px-0 text-left group transition-all
        active:scale-[0.99]"
    >
      <div
        aria-hidden="true"
        className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center
        text-[1.1rem] flex-shrink-0 transition-colors group-hover:bg-surface-container-highest"
      >
        {CATEGORY_ICONS[asset.category]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-on-surface font-body truncate">{asset.name}</p>
        {secondaryLine && (
          <p className="text-label-sm text-on-surface/50 font-body truncate">{secondaryLine}</p>
        )}
        {asset.notes && !secondaryLine && (
          <p className="text-label-sm text-on-surface/50 font-body truncate">{asset.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <div className="flex flex-col items-end">
          <span className={`text-body font-semibold font-body tabular-nums ${isDebt ? 'text-error' : 'text-on-surface'}`}>
            {formatEur(displayValue)}
          </span>
          {pnl !== null && (
            <span className={`text-label-sm font-body tabular-nums ${pnl >= 0 ? 'text-primary' : 'text-error'}`}>
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
            </span>
          )}
        </div>
        <ChevronRight size={15} className="text-outline-variant group-hover:text-on-surface/40 transition-colors" />
      </div>
    </button>
  )
}
