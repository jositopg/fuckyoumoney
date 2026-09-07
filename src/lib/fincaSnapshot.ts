import type { Asset, RealEstateMetadata } from '../types'

export interface FincaProperty {
  id: string
  name: string
  type: string
  status: string
  municipio?: string | null
  ownershipPct: number
  grossValue: number | null
  valueSource: 'mercado' | 'catastro' | null
  ownerShareValue: number | null
  monthlyContractedRent: number
  occupied: boolean
  ttmNetCashflow?: number
}

export interface FincaSnapshot {
  source: 'finca'
  asOf: string
  currency: 'EUR'
  scope: string
  gaps: string[]
  totals: {
    propertyCount: number
    grossMarketValue: number
    cadastralValue: number
    valueCoverage: { withMarket: number; withCadastralOnly: number; missing: number }
    mortgageOutstanding: number | null
    equity: number
    monthlyContractedRent: number
    ttmCollectedRent?: number
    ttmOperatingExpenses?: number
    ttmNetCashflow?: number
    occupancy: {
      rented: number
      vacant: number
      renovation: number
      forSale: number
      ownerUse: number
      rate: number | null
    }
  }
  properties: FincaProperty[]
}

const TYPE_MAP: Record<string, RealEstateMetadata['propertyType']> = {
  piso: 'alquiler',
  casa: 'alquiler',
  local: 'local',
  garaje: 'garaje',
  otro: 'otro',
}

export function fincaPropertyType(p: FincaProperty): RealEstateMetadata['propertyType'] {
  if (p.status === 'vivienda_habitual') return 'vivienda_habitual'
  if (p.type === 'local') return 'local'
  if (p.type === 'garaje') return 'garaje'
  if (p.status === 'uso_propio') return 'otro'
  return TYPE_MAP[p.type] ?? 'alquiler'
}

export function fincaPropertyToAsset(p: FincaProperty, now = new Date().toISOString()): Asset {
  const value = Number(p.ownerShareValue ?? 0)
  const monthlyRent = Number(p.monthlyContractedRent ?? 0)
  const metadata: RealEstateMetadata = {
    propertyType: fincaPropertyType(p),
    monthlyRent: monthlyRent || undefined,
    status: p.status,
    ownershipPct: Number(p.ownershipPct ?? 100),
    valueSource: p.valueSource ?? undefined,
    municipio: p.municipio ?? undefined,
    fincaId: p.id,
    ttmNetCashflow: p.ttmNetCashflow != null ? Number(p.ttmNetCashflow) : undefined,
  }
  return {
    id: p.id,
    category: 'real_estate',
    name: p.name,
    value,
    metadata,
    source: 'finca',
    readOnly: true,
    createdAt: now,
    updatedAt: now,
  }
}

export function snapshotToAssets(snapshot: FincaSnapshot): Asset[] {
  return snapshot.properties.map(p => fincaPropertyToAsset(p, snapshot.asOf))
}
