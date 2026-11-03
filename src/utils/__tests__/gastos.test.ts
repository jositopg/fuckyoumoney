import { describe, expect, it } from 'vitest'
import { DIAS_GASTO_REAL, gastoEfectivo, prepararGastosReales } from '../gastos'

const AHORA = '2026-11-03T12:00:00.000Z'
const MANUAL = 2000

function reales(parcial: Record<string, unknown> = {}) {
  return {
    mediaMensual: 1850.5,
    meses: 6,
    fuente: 'banco',
    hasta: '2026-10-31',
    actualizado: '2026-11-01T12:00:00.000Z',
    ...parcial,
  }
}

describe('gastoEfectivo', () => {
  it('el gasto real vigente gana al ajuste manual', () => {
    const gasto = gastoEfectivo(MANUAL, reales(), AHORA)
    expect(gasto.importe).toBe(1850.5)
    expect(gasto.origen).toBe('real')
    expect(gasto.manual).toBe(MANUAL)
    expect(gasto.caducado).toBe(false)
  })

  it('sin dato real el importe es el manual, sin convertirlo en cero', () => {
    const gasto = gastoEfectivo(MANUAL, null, AHORA)
    expect(gasto).toMatchObject({
      importe: MANUAL,
      origen: 'manual',
      manual: MANUAL,
      actualizado: null,
      caducado: false,
    })
    expect(gastoEfectivo(0, null, AHORA).importe).toBe(0)
    expect(gastoEfectivo(2000.004, null, AHORA).importe).toBe(2000.004)
  })

  it('a los 60 días caduca y vuelve el manual', () => {
    const justo = new Date(Date.parse(AHORA) - DIAS_GASTO_REAL * 24 * 60 * 60 * 1000).toISOString()
    const caducado = gastoEfectivo(MANUAL, reales({ actualizado: justo }), AHORA)
    expect(caducado.origen).toBe('manual')
    expect(caducado.importe).toBe(MANUAL)
    expect(caducado.caducado).toBe(true)
    expect(caducado.actualizado).toBe(justo)

    const unMs = new Date(Date.parse(justo) + 1).toISOString()
    const vigente = gastoEfectivo(MANUAL, reales({ actualizado: unMs }), AHORA)
    expect(vigente.origen).toBe('real')
    expect(vigente.importe).toBe(1850.5)
    expect(vigente.caducado).toBe(false)
  })

  it('una media vacía o no positiva no cuenta como real ni como caducada', () => {
    expect(gastoEfectivo(MANUAL, reales({ mediaMensual: 0 }), AHORA).origen).toBe('manual')
    expect(gastoEfectivo(MANUAL, reales({ mediaMensual: 0 }), AHORA).caducado).toBe(false)
    expect(gastoEfectivo(MANUAL, { fuente: 'banco' }, AHORA).caducado).toBe(false)
    expect(gastoEfectivo(MANUAL, reales({ actualizado: 'ayer' }), AHORA).origen).toBe('manual')
  })
})

describe('prepararGastosReales', () => {
  it('acepta el importe en español, el desglose y redondea a céntimos', () => {
    const registro = prepararGastosReales(
      {
        mediaMensual: '1.850,50',
        meses: '6',
        fuente: '  movimientos banco  ',
        hasta: '2026-10-31',
        desglose: { supermercado: '400,10', luz: 50 },
      },
      AHORA,
    )
    expect(registro).toEqual({
      mediaMensual: 1850.5,
      meses: 6,
      fuente: 'movimientos banco',
      hasta: '2026-10-31',
      actualizado: AHORA,
      desglose: { supermercado: 400.1, luz: 50 },
    })
  })

  it('rechaza meses, fuente, fecha, media e importes de desglose inválidos', () => {
    const base = { mediaMensual: 100, meses: 6, fuente: 'banco', hasta: '2026-10-31' }
    expect(() => prepararGastosReales({ ...base, meses: 2 }, AHORA)).toThrow(/3 y 24/)
    expect(() => prepararGastosReales({ ...base, meses: 25 }, AHORA)).toThrow(/3 y 24/)
    expect(() => prepararGastosReales({ ...base, meses: 3.5 }, AHORA)).toThrow(/3 y 24/)
    expect(() => prepararGastosReales({ ...base, fuente: '   ' }, AHORA)).toThrow(/80/)
    expect(() => prepararGastosReales({ ...base, fuente: 'x'.repeat(81) }, AHORA)).toThrow(/80/)
    expect(() => prepararGastosReales({ ...base, hasta: '2026-02-31' }, AHORA)).toThrow(/AAAA-MM-DD/)
    expect(() => prepararGastosReales({ ...base, mediaMensual: 0 }, AHORA)).toThrow(/mayor que cero/)
    expect(() => prepararGastosReales({ ...base, mediaMensual: -1 }, AHORA)).toThrow(/cero o más/)
    expect(() => prepararGastosReales({ ...base, desglose: { luz: -2 } }, AHORA)).toThrow(/cero o más/)
    expect(() => prepararGastosReales({ ...base, desglose: ['luz'] }, AHORA)).toThrow(/objeto por categoría/)
    expect(prepararGastosReales({ ...base, meses: 3 }, AHORA).meses).toBe(3)
    expect(prepararGastosReales({ ...base, meses: 24 }, AHORA).meses).toBe(24)
    expect(prepararGastosReales(base, AHORA).desglose).toBeUndefined()
  })
})
