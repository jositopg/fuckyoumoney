import { describe, expect, it } from 'vitest'
import { packNotes, unpackNotes } from '../fymMeta'

describe('fymMeta', () => {
  it('returns human notes when there is no extra', () => {
    expect(packNotes('hola')).toBe('hola')
    expect(packNotes(undefined, {})).toBeNull()
  })

  it('roundtrips extra + human', () => {
    const packed = packNotes('piso centro', { source: 'finca', monthlyRent: 750 })
    expect(packed?.startsWith('FYM1:')).toBe(true)
    const { human, extra } = unpackNotes(packed)
    expect(human).toBe('piso centro')
    expect(extra).toMatchObject({ source: 'finca', monthlyRent: 750 })
  })

  it('leaves plain notes untouched', () => {
    expect(unpackNotes('nota vieja')).toEqual({ human: 'nota vieja', extra: {} })
  })
})
