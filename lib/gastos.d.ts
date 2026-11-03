export interface GastosReales {
  mediaMensual: number
  meses: number
  fuente: string
  hasta: string
  actualizado: string
  desglose?: Record<string, number>
}

export interface GastoUsado {
  importe: number
  origen: 'real' | 'manual'
  manual: number
  actualizado: string | null
  hasta: string | null
  fuente: string | null
  meses: number | null
  caducado: boolean
}

export const DIAS_GASTO_REAL: number

export function redondearEuros(n: number): number
export function realesVigentes(
  reales: Partial<GastosReales> | null | undefined,
  ahora: string,
): boolean
export function gastoEfectivo(
  manual: number | null | undefined,
  reales: Partial<GastosReales> | null | undefined,
  ahora: string,
): GastoUsado
export function importeEuro(raw: unknown, clave: string): number
export function prepararGastosReales(
  datos: {
    mediaMensual?: unknown
    meses?: unknown
    fuente?: unknown
    hasta?: unknown
    desglose?: unknown
  } | null,
  actualizado: string,
): GastosReales
