import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Asset } from '../../types'
import type { AuthState } from '../../hooks/useAuth'
import type { AppData } from '../../types'
import { SettingsSheet } from '../SettingsSheet'
import { WealthStatus } from '../WealthStatus'

const cuenta: Asset = {
  id: 'caja',
  category: 'cash',
  name: 'Caja',
  value: 12000,
  metadata: { job: 'emergency' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const reales = {
  mediaMensual: 1850,
  meses: 6,
  fuente: 'banco',
  hasta: '2026-10-31',
  actualizado: new Date().toISOString(),
}

const datos: AppData = {
  assets: [cuenta],
  monthlyExpenses: 2000,
  schema_version: 4,
}

const auth: AuthState = {
  session: null,
  user: null,
  loading: false,
  configured: false,
  error: null,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  clearError: () => {},
}

describe('origen del gasto', () => {
  it('sin dato real la portada no añade una línea nueva', () => {
    render(<WealthStatus assets={[cuenta]} monthlyExpenses={2000} emergencyTargetMonths={6} />)
    expect(screen.queryByText(/Gasto real/)).toBeNull()
    expect(screen.queryByText(/caducó/)).toBeNull()
  })

  it('la portada y Ajustes dicen cuándo se usa el gasto real', () => {
    render(
      <WealthStatus
        assets={[cuenta]}
        monthlyExpenses={2000}
        emergencyTargetMonths={6}
        gastosReales={reales}
      />,
    )
    expect(screen.getByText(/Gasto real:/)).toBeTruthy()

    render(
      <SettingsSheet
        isOpen
        onClose={() => {}}
        monthlyExpenses={2000}
        emergencyTargetMonths={6}
        gastosReales={reales}
        onSave={() => {}}
        data={datos}
        setData={() => {}}
        auth={auth}
      />,
    )
    expect(screen.getByText(/El diagnóstico usa el gasto real/)).toBeTruthy()
    expect(screen.getByText(/Actual:/)).toBeTruthy()
  })

  it('si el real caducó, Ajustes lo dice y sigue mostrando el ajuste', () => {
    render(
      <SettingsSheet
        isOpen
        onClose={() => {}}
        monthlyExpenses={2000}
        emergencyTargetMonths={6}
        gastosReales={{ ...reales, actualizado: '2020-01-01T00:00:00.000Z' }}
        onSave={() => {}}
        data={datos}
        setData={() => {}}
        auth={auth}
      />,
    )
    expect(screen.getByText(/caducó/)).toBeTruthy()
    expect(screen.getByText(/Actual:/)).toBeTruthy()
    expect(screen.queryByText(/El diagnóstico usa el gasto real/)).toBeNull()
  })
})
