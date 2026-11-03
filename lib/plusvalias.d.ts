export interface DatosFiscales {
  valor: number
  participaciones?: number | null
  precioMedioCompra?: number | null
  costeFiscalTotal?: number | null
  fechaCompra?: string | null
}

export interface Plusvalia {
  euros: number
  porcentaje: number
  coste: number
}

export interface Minusvalia {
  anio: number
  importe: number
  compensado: number
}

export type EstadoMinusvalia = 'vigente' | 'caduca_este_ano' | 'caducada' | 'compensada'

export interface MinusvaliaLeida extends Minusvalia {
  pendiente: number
  caduca: number
  estado: EstadoMinusvalia
}

export function costeFiscalDe(datos: DatosFiscales | null | undefined): number | null
export function plusvaliaDe(datos: DatosFiscales | null | undefined): Plusvalia | null
export function totalPlusvalias(
  partidas: Array<{ plusvalia?: Plusvalia | null; euros?: number; coste?: number } | Plusvalia | null> | null | undefined,
): Plusvalia | null
export function caducidadMinusvalia(item: Partial<Minusvalia> | null | undefined, anioActual: number): MinusvaliaLeida
export function resumenMinusvalias(
  lista: Array<Partial<Minusvalia>> | null | undefined,
  anioActual: number,
): { minusvalias: MinusvaliaLeida[]; avisos: string[] }
export function upsertMinusvalia(lista: Minusvalia[] | null | undefined, item: Minusvalia): Minusvalia[]
