import { describe, expect, it } from 'vitest'
import {
  PatrimonioError,
  buscarPosicion,
  fichaDe,
  esEscritura,
  herramientas,
  notasConInteres,
  notasConParche,
  participacionesDe,
  planEvolucion,
  planificar,
  precioUnitario,
  responderEscritura,
  sinSecretos,
} from './patrimonio-logica.js'

const cuenta = {
  id: 'c1',
  nombre: 'Cuenta nómina',
  clase: 'cash',
  kind: 'asset',
  valor: 1000,
  source: 'manual',
  readOnly: false,
  slices: [{ job: 'emergency', amount: 400 }],
}

const piso = {
  id: 'f1',
  nombre: 'Piso Rambla',
  clase: 'real_estate',
  kind: 'asset',
  valor: 200000,
  source: 'finca',
  readOnly: true,
  institucion: 'finca',
}

describe('patrimonio', () => {
  it('la vista previa de un saldo no pide escritura', () => {
    const orden = planificar('fijar_valor', { posicion: 'nomina', valor: '1.500,50' }, [cuenta, piso])
    expect(orden.confirmar).toBe(false)
    expect(orden.vista.posicion).toMatchObject({ id: 'c1', antes: 1000, valor: 1500.5 })
  })

  it('no cambia un inmueble que viene de Finca', () => {
    expect(() => planificar('fijar_valor', { posicion: 'Rambla', valor: 10 }, [cuenta, piso])).toThrow(PatrimonioError)
  })

  it('no deja el saldo por debajo del colchón y el apartado', () => {
    expect(() => planificar('fijar_valor', { posicion: 'c1', valor: 100 }, [cuenta])).toThrow(/colchón/)
  })

  it('no crea otra posición con el mismo nombre ni un inmueble', () => {
    expect(() => planificar('crear_posicion', { nombre: 'Cuenta nómina', clase: 'efectivo', valor: 1 }, [cuenta])).toThrow(
      /fijar_valor/,
    )
    expect(() => planificar('crear_posicion', { nombre: 'Solar', clase: 'piso', valor: 1 }, [])).toThrow(/clase/)
  })

  it('marca el interés en las notas sin perder los trozos', () => {
    const iso = '2026-11-02T19:20:00.000Z'
    const notes = notasConInteres(
      'FYM1:{"slices":[{"job":"emergency","amount":3000}],"interestRate":1.5,"human":"nómina"}',
      iso,
    )
    expect(JSON.parse(notes.slice('FYM1:'.length))).toEqual({
      slices: [{ job: 'emergency', amount: 3000 }],
      interestRate: 1.5,
      human: 'nómina',
      lastInterestUpdate: iso,
    })
    expect(JSON.parse(notasConInteres(null, iso).slice('FYM1:'.length))).toEqual({ lastInterestUpdate: iso })
    expect(JSON.parse(notasConInteres('solo texto', iso).slice('FYM1:'.length))).toEqual({
      human: 'solo texto',
      lastInterestUpdate: iso,
    })
  })

  it('encuentra por id y quita claves sensibles', () => {
    expect(buscarPosicion([cuenta], 'c1').nombre).toBe('Cuenta nómina')
    expect(sinSecretos({ email: 'a@b.c', neto: 1, anidado: { dni: 'x', nombre: 'Jose' } })).toEqual({
      neto: 1,
      anidado: { nombre: 'Jose' },
    })
  })
})

const fondo = {
  id: 'v1',
  nombre: 'Vanguard FTSE All world (ING)',
  clase: 'etf',
  kind: 'asset',
  valor: 1000,
  source: 'manual',
  readOnly: false,
  institucion: null,
  notes: 'FYM1:{"human":"mundo"}',
}

const plan = {
  id: 'p1',
  nombre: 'Plan individual',
  clase: 'pension',
  kind: 'asset',
  valor: 4000,
  source: 'manual',
}

const deuda = {
  id: 'd1',
  nombre: 'Coche',
  clase: 'deuda',
  kind: 'liability',
  valor: 8000,
  source: 'manual',
}

describe('fijar_detalle', () => {
  it('sin confirmar no escribe y devuelve el antes y el después', () => {
    const orden = planificar('fijar_detalle', { posicion: 'Vanguard', campos: { participaciones: 10 } }, [fondo, piso])
    const respuesta = responderEscritura(orden, null)
    expect(orden.confirmar).toBe(false)
    expect(respuesta.escribir).toBe(false)
    expect(respuesta.cuerpo.escrito).toBe(false)
    expect(respuesta.cuerpo.vistaPrevia).toBe(true)
    expect(respuesta.cuerpo.posicion.antes.participaciones).toBeNull()
    expect(respuesta.cuerpo.posicion.despues).toMatchObject({ participaciones: 10, precioPorParticipacion: 100 })
    expect(orden.metadata.pricePerUnit).toBe(100)
  })

  it('al confirmar exige clave y la misma clave no vuelve a escribir', () => {
    expect(() =>
      planificar('fijar_detalle', { posicion: 'v1', campos: { isin: 'IE00BK5BQT80' }, confirmar: true }, [fondo]),
    ).toThrow(/clave/)
    const orden = planificar(
      'fijar_detalle',
      { posicion: 'v1', campos: { institucion: 'ING' }, confirmar: true, clave: 'broker-ing-01' },
      [fondo],
    )
    const primera = responderEscritura(orden, null)
    const segunda = responderEscritura(orden, primera.cuerpo)
    expect(primera.escribir).toBe(true)
    expect(segunda.escribir).toBe(false)
    expect(segunda.cuerpo.repetida).toBe(true)
    expect(segunda.cuerpo.posicion).toEqual(primera.cuerpo.posicion)
  })

  it('rechaza un campo desconocido, un ISIN inválido y una fecha imposible', () => {
    expect(() => planificar('fijar_detalle', { posicion: 'v1', campos: { valor: 1 } }, [fondo])).toThrow(/valor/)
    expect(() => planificar('fijar_detalle', { posicion: 'v1', campos: { isin: 'IE00BK5BQT81' } }, [fondo])).toThrow(/ISIN/)
    expect(() => planificar('fijar_detalle', { posicion: 'v1', campos: { fechaCompra: '2026-02-31' } }, [fondo])).toThrow(
      /AAAA-MM-DD/,
    )
    expect(() => planificar('fijar_detalle', { posicion: 'v1', campos: { participaciones: 0 } }, [fondo])).toThrow(
      /mayor que cero/,
    )
  })

  it('con participaciones el precio es el valor partido, y sin ellas la lectura no cambia', () => {
    const antigua = {
      id: 'a1',
      nombre: 'Fondo viejo',
      clase: 'etf',
      kind: 'asset',
      valor: 1000,
      quantity: 1,
      source: 'manual',
      metadata: { pricePerUnit: 1000 },
    }
    const vieja = fichaDe(antigua)
    expect(vieja.valor).toBe(1000)
    expect(vieja.participaciones).toBeUndefined()
    expect(vieja.precioPorParticipacion).toBeUndefined()
    expect(participacionesDe(antigua)).toBeUndefined()
    expect(precioUnitario(1000, undefined)).toBeUndefined()
    expect(fichaDe({ ...antigua, metadata: { participaciones: 10, pricePerUnit: 1000 } }).precioPorParticipacion).toBe(100)
    const soloIsin = planificar('fijar_detalle', { posicion: 'v1', campos: { isin: 'ie00bk5bqt80' } }, [fondo])
    expect(soloIsin.metadata.isin).toBe('IE00BK5BQT80')
    expect(soloIsin.metadata.pricePerUnit).toBeUndefined()
  })

  it('avisa si la pensión pasa de 1.500 € al año y no lo trata como error', () => {
    const orden = planificar('fijar_detalle', { posicion: 'Plan', campos: { aportacionAnual: 2000 } }, [plan])
    expect(orden.vista.avisos[0]).toMatch(/1\.500/)
    expect(orden.resultado.avisos[0]).toMatch(/1\.500/)
    const justo = planificar('fijar_detalle', { posicion: 'p1', campos: { aportacionAnual: 1500 } }, [plan])
    expect(justo.vista.avisos).toBeUndefined()
  })

  it('cambia la institución de una posición manual y no la de Finca', () => {
    const orden = planificar('fijar_detalle', { posicion: 'Vanguard FTSE', campos: { institucion: 'ING' } }, [fondo, piso])
    expect(orden.columnas.institution).toBe('ING')
    expect(orden.metadata.broker).toBe('ING')
    expect(orden.vista.posicion.despues.institucion).toBe('ING')
    expect(() => planificar('fijar_detalle', { posicion: 'Rambla', campos: { institucion: 'ING' } }, [fondo, piso])).toThrow(
      /Finca/,
    )
  })

  it('acepta liquida true y lo enseña en la vista previa', () => {
    const orden = planificar(
      'fijar_detalle',
      { posicion: 'Vanguard', campos: { liquida: true } },
      [{ ...fondo, liquida: false }],
    )
    expect(orden.columnas.isLiquid).toBe(true)
    expect(orden.metadata.liquida).toBeUndefined()
    expect(orden.vista.posicion.antes.liquida).toBe(false)
    expect(orden.vista.posicion.despues.liquida).toBe(true)
  })

  it('rechaza liquida si no es true o false', () => {
    expect(() => planificar('fijar_detalle', { posicion: 'Vanguard', campos: { liquida: 'si' } }, [fondo])).toThrow(
      /true o false/,
    )
  })

  it('rechaza liquida en una deuda', () => {
    expect(() => planificar('fijar_detalle', { posicion: 'Coche', campos: { liquida: true } }, [deuda])).toThrow(/deuda/)
  })

  it('guarda la cuota en monthlyPayment y no pisa el resto de las notas', () => {
    const orden = planificar('fijar_detalle', { posicion: 'Coche', campos: { cuotaMensual: '450' } }, [deuda])
    expect(orden.metadata.monthlyPayment).toBe(450)
    expect(orden.columnas.monthlyPayment).toBe(450)
    const notes = notasConParche(
      'FYM1:{"slices":[{"job":"emergency","amount":400}],"human":"nómina"}',
      orden.notas,
    )
    expect(JSON.parse(notes.slice('FYM1:'.length))).toMatchObject({
      slices: [{ job: 'emergency', amount: 400 }],
      human: 'nómina',
      cuotaMensual: 450,
      monthlyPayment: 450,
    })
    expect(JSON.parse(notes.slice('FYM1:'.length)).lastInterestUpdate).toBeUndefined()
  })
})

describe('evolucion', () => {
  it('no escribe', () => {
    expect(herramientas.some((h) => h.nombre === 'evolucion')).toBe(true)
    expect(esEscritura('evolucion')).toBe(false)
    expect(() => planificar('evolucion', {}, [cuenta])).toThrow(/no escribe/)
  })

  it('acepta una posición de Finca y rechaza un rango invertido', () => {
    expect(
      planEvolucion({ posicion: 'Rambla', desde: '2026-01-01', hasta: '2026-06-01' }, [cuenta, piso], '2026-11-03').posicion
        .id,
    ).toBe('f1')
    expect(planEvolucion({}, [cuenta], '2026-11-03')).toMatchObject({
      posicion: null,
      posicionId: null,
      hasta: '2026-11-03',
      desde: null,
    })
    expect(planEvolucion({ posicion: 'nomina' }, [cuenta, piso], '2026-11-03').posicionId).toBe('c1')
    expect(() => planEvolucion({ desde: '2026-02-31' }, [], '2026-11-03')).toThrow(PatrimonioError)
    expect(() => planEvolucion({ desde: '2026-06-02', hasta: '2026-06-01' }, [], '2026-11-03')).toThrow(/posterior/)
  })
})

describe('fijar_minusvalia', () => {
  it('la vista previa no escribe y la misma clave no vuelve a escribir', () => {
    const previa = planificar('fijar_minusvalia', { anio: 2022, importe: '1.000,50' }, [])
    expect(previa.confirmar).toBe(false)
    expect(previa.vista.vistaPrevia).toBe(true)
    expect(previa.vista.minusvalia).toMatchObject({ anio: 2022, importe: 1000.5, compensado: 0, caduca: 2026 })
    expect(esEscritura('fijar_minusvalia')).toBe(true)

    const orden = planificar(
      'fijar_minusvalia',
      { anio: 2022, importe: 1000, compensado: 100, confirmar: true, clave: 'perdida-2022' },
      [],
    )
    expect(orden.minusvalia).toEqual({ anio: 2022, importe: 1000, compensado: 100 })
    expect(responderEscritura(orden, null)).toEqual({ escribir: true, cuerpo: orden.resultado })
    const repetida = responderEscritura(orden, orden.resultado)
    expect(repetida.escribir).toBe(false)
    expect(repetida.cuerpo.repetida).toBe(true)
    expect(repetida.cuerpo.minusvalia.importe).toBe(1000)

    expect(() => planificar('fijar_minusvalia', { anio: 2022, importe: 0 }, [])).toThrow(/mayor que cero/)
    expect(() => planificar('fijar_minusvalia', { anio: 2022, importe: 10, compensado: 11 }, [])).toThrow(/superar/)
  })

  it('la ficha trae la plusvalía y sin coste es null', () => {
    const conCoste = fichaDe({
      id: 'v9',
      nombre: 'Fondo con coste',
      clase: 'etf',
      kind: 'asset',
      valor: 1500,
      metadata: { participaciones: 10, precioMedioCompra: 100 },
    })
    expect(conCoste.plusvalia).toEqual({ euros: 500, porcentaje: 50, coste: 1000 })
    expect(fichaDe(fondo).plusvalia).toBeNull()
  })
})

describe('fijar_gastos', () => {
  const ahora = '2026-11-03T12:00:00.000Z'
  const args = {
    mediaMensual: '1.850,50',
    meses: 6,
    fuente: 'banco',
    hasta: '2026-10-31',
    desglose: { supermercado: '400,00' },
  }

  it('la vista previa no escribe y la misma clave no vuelve a escribir', () => {
    const previa = planificar('fijar_gastos', args, [], ahora)
    expect(previa.confirmar).toBe(false)
    expect(previa.vista.vistaPrevia).toBe(true)
    expect(previa.vista.gastosReales).toEqual({
      mediaMensual: 1850.5,
      meses: 6,
      fuente: 'banco',
      hasta: '2026-10-31',
      actualizado: ahora,
      desglose: { supermercado: 400 },
    })
    expect(previa.vista.gasto).toMatchObject({ importe: 1850.5, origen: 'real', caducado: false })
    expect(esEscritura('fijar_gastos')).toBe(true)
    expect(previa.gastos).toBe(previa.vista.gastosReales)

    const orden = planificar('fijar_gastos', { ...args, confirmar: true, clave: 'gasto-banco-01' }, [], ahora)
    expect(responderEscritura(orden, null)).toEqual({ escribir: true, cuerpo: orden.resultado })
    const repetida = responderEscritura(orden, orden.resultado)
    expect(repetida.escribir).toBe(false)
    expect(repetida.cuerpo.repetida).toBe(true)
    expect(repetida.cuerpo.gastosReales.mediaMensual).toBe(1850.5)
  })

  it('rechaza una media vacía, pocos meses y una fecha imposible', () => {
    expect(() => planificar('fijar_gastos', { ...args, mediaMensual: 0 }, [], ahora)).toThrow(/mayor que cero/)
    expect(() => planificar('fijar_gastos', { ...args, meses: 2 }, [], ahora)).toThrow(/3 y 24/)
    expect(() => planificar('fijar_gastos', { ...args, hasta: '2026-02-31' }, [], ahora)).toThrow(/AAAA-MM-DD/)
    expect(() => planificar('fijar_gastos', { ...args, fuente: '' }, [], ahora)).toThrow(/80/)
  })
})

describe('fijar_asignacion', () => {
  const args = { inmuebles: 50, bolsa: 30, liquidez: 20 }
  const posiciones = [
    { clase: 'real_estate', kind: 'asset', valor: 60, source: 'finca' },
    { clase: 'etf', kind: 'asset', valor: 30 },
    { clase: 'cash', kind: 'asset', valor: 10 },
  ]

  it('la vista previa no escribe y la misma clave no vuelve a escribir', () => {
    const previa = planificar('fijar_asignacion', args, posiciones)
    expect(previa.confirmar).toBe(false)
    expect(previa.vista.vistaPrevia).toBe(true)
    expect(previa.asignacion).toEqual({ ...args, tolerancia: 5 })
    expect(previa.vista.asignacionObjetivo).toEqual(previa.asignacion)
    expect(previa.vista.asignacion.avisos).toEqual([
      'Inmuebles está 10 puntos por encima del objetivo (10,00 € para volver).',
      'Liquidez está 10 puntos por debajo del objetivo (10,00 € para volver).',
    ])
    expect(esEscritura('fijar_asignacion')).toBe(true)
    expect(herramientas.some((h) => h.nombre === 'fijar_asignacion')).toBe(true)

    const orden = planificar('fijar_asignacion', { ...args, confirmar: true, clave: 'asig-perfil-01' }, [])
    expect(responderEscritura(orden, null)).toEqual({ escribir: true, cuerpo: orden.resultado })
    const repetida = responderEscritura(orden, orden.resultado)
    expect(repetida.escribir).toBe(false)
    expect(repetida.cuerpo.repetida).toBe(true)
    expect(repetida.cuerpo.asignacionObjetivo.inmuebles).toBe(50)
  })

  it('rechaza una suma distinta de 100 y no avisa en el límite', () => {
    expect(() => planificar('fijar_asignacion', { inmuebles: 40, bolsa: 30, liquidez: 20 }, [])).toThrow(/sumar 100/)
    expect(() => planificar('fijar_asignacion', { inmuebles: 50.5, bolsa: 30, liquidez: 19.5 }, [])).toThrow(/entero/)
    const limite = planificar('fijar_asignacion', { ...args, tolerancia: 5 }, [
      { clase: 'real_estate', kind: 'asset', valor: 55 },
      { clase: 'stock', kind: 'asset', valor: 25 },
      { clase: 'cash', kind: 'asset', valor: 20 },
    ])
    expect(limite.vista.asignacion.avisos).toEqual([])
  })
})
