import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Asset, AssetCategory } from '../../types'
import { diagnoseWealth } from '../../utils/moneyDiagnosis'
import { MixPanel } from '../AllocationPanel'
import { WealthStatus } from '../WealthStatus'

const piso: Asset = {
  id: 'piso',
  category: 'real_estate',
  name: 'Piso',
  value: 100000,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const aviso = 'Inmuebles está 10 puntos por encima del objetivo (10,00 € para volver).'

describe('aviso de asignación en la mezcla', () => {
  const mix = diagnoseWealth([piso], 2000).mix

  it('sin avisos la mezcla no añade una línea', () => {
    const { rerender } = render(<MixPanel mix={mix} />)
    expect(screen.queryByText(/del objetivo/)).toBeNull()
    rerender(<MixPanel mix={mix} avisos={[]} />)
    expect(screen.queryByText(/del objetivo/)).toBeNull()
  })

  it('muestra el aviso cuando una clase se sale de la tolerancia', () => {
    render(<MixPanel mix={mix} avisos={[aviso]} />)
    expect(screen.getByText(aviso)).toBeTruthy()
  })
})

function activo(id: string, category: AssetCategory, value: number, source?: Asset['source']): Asset {
  return {
    id,
    category,
    name: id,
    value,
    source,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const objetivo = { inmuebles: 50, bolsa: 30, liquidez: 20, tolerancia: 5 }

describe('aviso de asignación en la portada', () => {
  const sesgado = [
    activo('piso', 'real_estate', 60, 'finca'),
    activo('fondo', 'stocks', 30),
    activo('caja', 'cash', 10),
  ]
  const limite = [
    activo('piso', 'real_estate', 55, 'finca'),
    activo('fondo', 'stocks', 25),
    activo('caja', 'cash', 20),
  ]

  it('sin objetivo no añade el aviso', () => {
    render(<WealthStatus assets={sesgado} monthlyExpenses={2000} />)
    expect(screen.queryByText(/del objetivo/)).toBeNull()
  })

  it('en el límite no avisa y por encima sí', () => {
    const { rerender } = render(
      <WealthStatus assets={limite} monthlyExpenses={2000} asignacionObjetivo={objetivo} />,
    )
    expect(screen.queryByText(/del objetivo/)).toBeNull()
    rerender(<WealthStatus assets={sesgado} monthlyExpenses={2000} asignacionObjetivo={objetivo} />)
    expect(screen.getByText(/Inmuebles está 10 puntos por encima del objetivo/)).toBeTruthy()
    expect(screen.getByText(/Liquidez está 10 puntos por debajo del objetivo/)).toBeTruthy()
  })
})
