import { describe, expect, it } from 'vitest'
import {
  PatrimonioError,
  buscarPosicion,
  fichaDe,
  notasConInteres,
  notasConParche,
  participacionesDe,
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
