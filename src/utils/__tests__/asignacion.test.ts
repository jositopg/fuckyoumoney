import { describe, expect, it } from 'vitest'
import {
  claseDe,
  objetivoValido,
  prepararAsignacion,
  repartoActual,
  TOLERANCIA_DEFECTO,
} from '../asignacion'

const OBJETIVO = { inmuebles: 50, bolsa: 30, liquidez: 20 }

function partida(
  clase: string,
  valor: number,
  extra: Record<string, unknown> = {},
) {
  return { class: clase, kind: 'asset', value: valor, ...extra }
}

describe('prepararAsignacion', () => {
  it('exige que los tres porcentajes sumen 100 y sean enteros', () => {
    expect(() => prepararAsignacion({ inmuebles: 40, bolsa: 30, liquidez: 29 })).toThrow(/sumar 100/)
    expect(() => prepararAsignacion({ inmuebles: 40, bolsa: 30, liquidez: 31 })).toThrow(/sumar 100/)
    expect(() => prepararAsignacion({ inmuebles: 50.5, bolsa: 30, liquidez: 19.5 })).toThrow(/entero/)
    expect(() => prepararAsignacion({ inmuebles: '50.5', bolsa: 30, liquidez: 19.5 })).toThrow(/entero/)
    expect(() => prepararAsignacion({ inmuebles: -1, bolsa: 51, liquidez: 50 })).toThrow(/entero/)
    expect(() => prepararAsignacion({ inmuebles: 101, bolsa: 0, liquidez: -1 })).toThrow(/entero/)
  })

  it('acepta enteros en texto y pone la tolerancia en 5 si no viene', () => {
    expect(prepararAsignacion({ inmuebles: '50', bolsa: '30', liquidez: '20' })).toEqual({
      ...OBJETIVO,
      tolerancia: TOLERANCIA_DEFECTO,
    })
    expect(prepararAsignacion({ ...OBJETIVO, tolerancia: 0 }).tolerancia).toBe(0)
    expect(prepararAsignacion({ ...OBJETIVO, tolerancia: '8' }).tolerancia).toBe(8)
    expect(() => prepararAsignacion({ ...OBJETIVO, tolerancia: 101 })).toThrow(/tolerancia/)
  })

  it('un objetivo ausente o corrupto no es válido y no lanza', () => {
    expect(objetivoValido(null)).toBeNull()
    expect(objetivoValido(undefined)).toBeNull()
    expect(objetivoValido({ inmuebles: 10 })).toBeNull()
    expect(objetivoValido('50')).toBeNull()
    expect(objetivoValido({ ...OBJETIVO, tolerancia: 5 })).toEqual({ ...OBJETIVO, tolerancia: 5 })
  })
})

describe('repartoActual', () => {
  it('sin objetivo no hay reparto ni aviso', () => {
    const partidas = [partida('real_estate', 90, { source: 'finca' }), partida('cash', 10)]
    expect(repartoActual(partidas, null)).toBeNull()
    expect(repartoActual(partidas, { inmuebles: 10, bolsa: 10, liquidez: 10 })).toBeNull()
  })

  it('en el límite de la tolerancia no avisa', () => {
    const reparto = repartoActual(
      [partida('real_estate', 55), partida('etf', 25), partida('cash', 20)],
      { ...OBJETIVO, tolerancia: 5 },
    )
    expect(reparto).not.toBeNull()
    expect(reparto!.avisos).toEqual([])
    expect(reparto!.clases.map((fila) => fila.fuera)).toEqual([false, false, false])
    expect(reparto!.clases.find((fila) => fila.clase === 'inmuebles')).toMatchObject({
      puntos: 5,
      euros: 5,
    })
    expect(reparto!.clases.find((fila) => fila.clase === 'bolsa')).toMatchObject({
      puntos: -5,
      euros: -5,
    })
  })

  it('por encima del límite dice los puntos y los euros para volver', () => {
    const reparto = repartoActual(
      [partida('real_estate', 60), partida('stock', 30), partida('cash', 10)],
      OBJETIVO,
    )
    expect(reparto!.avisos).toEqual([
      'Inmuebles está 10 puntos por encima del objetivo (10,00 € para volver).',
      'Liquidez está 10 puntos por debajo del objetivo (10,00 € para volver).',
    ])
    expect(reparto!.clases.find((fila) => fila.clase === 'bolsa')!.fuera).toBe(false)
  })

  it('una desviación de 5,01 puntos sí avisa', () => {
    const reparto = repartoActual(
      [partida('real_estate', 55.01), partida('etf', 24.99), partida('cash', 20)],
      { ...OBJETIVO, tolerancia: 5 },
    )
    expect(reparto!.avisos[0]).toBe(
      'Inmuebles está 5,01 puntos por encima del objetivo (5,01 € para volver).',
    )
  })

  it('el inmueble de Finca es inmuebles y la cripto no es bolsa', () => {
    expect(claseDe({ category: 'real_estate', source: 'finca', value: 70 })).toBe('inmuebles')
    expect(claseDe({ class: 'crypto', kind: 'asset', value: 40 })).toBe('resto')
    expect(claseDe({ category: 'stocks', value: 10 })).toBe('bolsa')
    expect(claseDe({ clase: 'etf', valor: 10 })).toBe('bolsa')
    const reparto = repartoActual(
      [
        { category: 'real_estate', source: 'finca', value: 40 },
        { class: 'crypto', kind: 'asset', value: 40 },
        { category: 'cash', value: 20 },
      ],
      { inmuebles: 40, bolsa: 40, liquidez: 20, tolerancia: 5 },
    )
    expect(reparto!.total).toBe(100)
    expect(reparto!.clases.find((fila) => fila.clase === 'inmuebles')).toMatchObject({
      valor: 40,
      porcentaje: 40,
      fuera: false,
    })
    expect(reparto!.clases.find((fila) => fila.clase === 'bolsa')).toMatchObject({
      valor: 0,
      porcentaje: 0,
      fuera: true,
    })
    expect(reparto!.clases.find((fila) => fila.clase === 'liquidez')!.fuera).toBe(false)
    expect(reparto!.avisos).toEqual([
      'Bolsa está 40 puntos por debajo del objetivo (40,00 € para volver).',
    ])
  })

  it('la deuda no entra en la base y un total vacío no avisa', () => {
    const reparto = repartoActual(
      [
        partida('cash', 100),
        { class: 'mortgage', kind: 'liability', value: 1000 },
        { category: 'debt', value: 500 },
      ],
      { inmuebles: 0, bolsa: 0, liquidez: 100, tolerancia: 5 },
    )
    expect(reparto!.total).toBe(100)
    expect(reparto!.avisos).toEqual([])
    expect(repartoActual([], OBJETIVO)).toMatchObject({ total: 0, avisos: [] })
    expect(repartoActual([{ class: 'cash', value: 0 }], OBJETIVO)!.avisos).toEqual([])
  })

  it('formatea los euros con miles', () => {
    const reparto = repartoActual(
      [partida('real_estate', 6000), partida('etf', 3000), partida('cash', 1000)],
      OBJETIVO,
    )
    expect(reparto!.avisos[0]).toContain('(1.000,00 € para volver)')
  })
})
