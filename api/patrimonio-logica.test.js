import { describe, expect, it } from 'vitest'
import { PatrimonioError, buscarPosicion, planificar, sinSecretos } from './patrimonio-logica.js'

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

  it('encuentra por id y quita claves sensibles', () => {
    expect(buscarPosicion([cuenta], 'c1').nombre).toBe('Cuenta nómina')
    expect(sinSecretos({ email: 'a@b.c', neto: 1, anidado: { dni: 'x', nombre: 'Jose' } })).toEqual({
      neto: 1,
      anidado: { nombre: 'Jose' },
    })
  })
})
