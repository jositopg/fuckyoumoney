import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Asset } from '../../types'
import { diagnoseWealth } from '../../utils/moneyDiagnosis'
import { MixPanel } from '../AllocationPanel'

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
