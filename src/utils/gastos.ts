export type { GastosReales, GastoUsado } from '../../lib/gastos.js'
export {
  DIAS_GASTO_REAL,
  gastoEfectivo,
  importeEuro,
  prepararGastosReales,
  realesVigentes,
  redondearEuros,
} from '../../lib/gastos.js'

/** Fecha corta en Madrid para la línea de gasto de la portada y de Ajustes. */
export function fechaDeGasto(iso: string | null | undefined): string {
  if (!iso) return ''
  const fecha = new Date(iso)
  if (!Number.isFinite(fecha.getTime())) return ''
  return fecha.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  })
}
