import { describe, expect, it } from 'vitest'
import { inferInvestment, looksLikeInvestment } from '../inferInvestment'

describe('inferInvestment', () => {
  it('recognises Inbestme portfolio by name', () => {
    const inf = inferInvestment('ETFs ProyectoK 8/10 Inbestme')
    expect(inf.isInvestment).toBe(true)
    expect(inf.category).toBe('stocks')
    expect(inf.assetType).toBe('etf')
    expect(inf.broker).toBe('Inbestme')
    expect(inf.assetClass).toBe('equity')
  })

  it('recognises Numantia active fund and ISIN in the name', () => {
    const inf = inferInvestment('Renta 4 multigestión Numantia patrimonio global FI ES0173311103')
    expect(inf.isInvestment).toBe(true)
    expect(inf.assetType).toBe('fondo_activo')
    expect(inf.isin).toBe('ES0173311103')
    expect(inf.broker).toBe('Renta 4')
    expect(inf.assetClass).toBe('mixed')
  })

  it('does not treat a motorbike as a fund', () => {
    expect(looksLikeInvestment('Moto SYM')).toBe(false)
    expect(inferInvestment('Moto SYM').isInvestment).toBe(false)
  })

  it('treats a pension plan as pension, not etf', () => {
    const inf = inferInvestment('PPA mutualidad')
    expect(inf.category).toBe('pension')
  })
})
