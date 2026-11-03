import { describe, expect, it } from 'vitest'
import {
  caducidadMinusvalia,
  plusvaliaDe,
  resumenMinusvalias,
  totalPlusvalias,
  upsertMinusvalia,
} from '../plusvalias'

describe('plusvalía latente', () => {
  it('resta el coste fiscal y da el porcentaje', () => {
    expect(plusvaliaDe({ valor: 150, participaciones: 10, precioMedioCompra: 10 })).toEqual({
      euros: 50,
      porcentaje: 50,
      coste: 100,
    })
  })

  it('puede ser negativa', () => {
    expect(plusvaliaDe({ valor: 80, costeFiscalTotal: 100 })).toEqual({
      euros: -20,
      porcentaje: -20,
      coste: 100,
    })
  })

  it('sin coste fiscal es null y no cero', () => {
    expect(plusvaliaDe({ valor: 100 })).toBeNull()
    expect(plusvaliaDe({ valor: 100, costeFiscalTotal: 0 })).toBeNull()
    expect(plusvaliaDe({ valor: 100, participaciones: 10 })).toBeNull()
    expect(plusvaliaDe({ valor: 100, precioMedioCompra: 10 })).toBeNull()
    expect(plusvaliaDe({ valor: 100, participaciones: 10, precioMedioCompra: 0 })).toBeNull()
    expect(plusvaliaDe({ valor: 100, fechaCompra: '2020-01-01' })).toBeNull()
  })

  it('el total declarado gana a participaciones por precio medio, y el total ignora las que no tienen coste', () => {
    const conTotal = plusvaliaDe({
      valor: 90,
      participaciones: 10,
      precioMedioCompra: 10,
      costeFiscalTotal: 80,
    })
    expect(conTotal).toEqual({ euros: 10, porcentaje: 12.5, coste: 80 })
    expect(
      totalPlusvalias([
        { plusvalia: conTotal },
        { plusvalia: plusvaliaDe({ valor: 50, participaciones: 2, precioMedioCompra: 3.33 }) },
        { plusvalia: null },
      ]),
    ).toEqual({ euros: 53.34, porcentaje: 61.55, coste: 86.66 })
  })

  it('redondea a céntimos', () => {
    expect(plusvaliaDe({ valor: 40, participaciones: 10.2, precioMedioCompra: 3.33 })).toEqual({
      euros: 6.03,
      porcentaje: 17.75,
      coste: 33.97,
    })
  })
})

describe('minusvalías pendientes', () => {
  it('caduca a los cuatro años y avisa de las de este año', () => {
    const resumen = resumenMinusvalias(
      [
        { anio: 2022, importe: 1000, compensado: 0 },
        { anio: 2024, importe: 500, compensado: 100 },
        { anio: 2020, importe: 200, compensado: 0 },
        { anio: 2021, importe: 300, compensado: 300 },
      ],
      2026,
    )
    expect(caducidadMinusvalia({ anio: 2022, importe: 1000, compensado: 0 }, 2026)).toMatchObject({
      pendiente: 1000,
      caduca: 2026,
      estado: 'caduca_este_ano',
    })
    expect(resumen.minusvalias.map((fila) => fila.estado)).toEqual([
      'caducada',
      'compensada',
      'caduca_este_ano',
      'vigente',
    ])
    expect(resumen.minusvalias.find((fila) => fila.anio === 2024)).toMatchObject({ pendiente: 400, caduca: 2028 })
    expect(resumen.avisos).toEqual([
      'La minusvalía de 2022 (1.000,00 € pendientes) caduca este año (2026).',
    ])
  })

  it('el mismo año no se duplica', () => {
    const lista = upsertMinusvalia([{ anio: 2022, importe: 1000, compensado: 0 }], {
      anio: 2022,
      importe: 800,
      compensado: 50,
    })
    expect(lista).toEqual([{ anio: 2022, importe: 800, compensado: 50 }])
  })
})
