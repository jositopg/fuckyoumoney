export const TOLERANCIA_DEFECTO: 5

export type ClaseAsignacion = 'inmuebles' | 'bolsa' | 'liquidez'

export interface AsignacionObjetivo {
  inmuebles: number
  bolsa: number
  liquidez: number
  tolerancia: number
}

export interface RepartoClase {
  clase: ClaseAsignacion
  valor: number
  porcentaje: number
  objetivo: number
  puntos: number
  euros: number
  fuera: boolean
}

export interface RepartoActual {
  objetivo: AsignacionObjetivo
  total: number
  clases: RepartoClase[]
  avisos: string[]
}

export interface PartidaAsignacion {
  category?: string
  class?: string
  clase?: string
  kind?: string
  value?: number
  valor?: number
  source?: string
}

export function prepararAsignacion(
  datos: {
    inmuebles?: unknown
    bolsa?: unknown
    liquidez?: unknown
    tolerancia?: unknown
  } | null,
): AsignacionObjetivo

export function objetivoValido(raw: unknown): AsignacionObjetivo | null

export function claseDe(
  partida: PartidaAsignacion | null | undefined,
): ClaseAsignacion | 'resto' | null

export function repartoActual(
  partidas: readonly PartidaAsignacion[] | null | undefined,
  objetivo: unknown,
): RepartoActual | null
