export interface PuntoEvolucion {
  fecha: string
  valor: number
  participaciones?: number | null
  precioPorParticipacion?: number | null
  precio_por_participacion?: number | null
  kind?: 'asset' | 'liability'
  position_id?: string
  positionId?: string
}

export interface Variacion {
  porcentaje: number | null
  base: number | null
  actual: number | null
  desde: string
}

export interface Evolucion {
  desde: string | null
  hasta: string
  serie: PuntoEvolucion[]
  variacion: {
    '1d': Variacion
    '30d': Variacion
    ytd: Variacion
    '12m': Variacion
  }
}

export function fechaMadrid(ahora?: Date | string | number): string
export function sumarDias(fecha: string, dias: number): string
export function restarAnios(fecha: string, anios: number): string
export function dedupePuntos<T extends { fecha: string }>(puntos: T[]): T[]
export function evolucionDe(puntos: PuntoEvolucion[], opciones?: { desde?: string | null; hasta?: string | null }): Evolucion
export function netoDiario(filas: PuntoEvolucion[], hasta?: string | null): PuntoEvolucion[]
export function serieParaGrafico(puntos: PuntoEvolucion[]): { date: string; value: number }[]
