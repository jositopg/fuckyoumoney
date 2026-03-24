import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from '../useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('returns initialValue when key does not exist in localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', { count: 0 }))
    expect(result.current[0]).toEqual({ count: 0 })
  })

  it('reads existing value from localStorage', () => {
    localStorage.setItem('test-key', JSON.stringify({ count: 42 }))
    const { result } = renderHook(() => useLocalStorage('test-key', { count: 0 }))
    expect(result.current[0]).toEqual({ count: 42 })
  })

  it('updates state and localStorage when setValue is called with a value', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 0))
    act(() => {
      result.current[1](99)
    })
    expect(result.current[0]).toBe(99)
    expect(JSON.parse(localStorage.getItem('test-key')!)).toBe(99)
  })

  it('updates state using function updater form', () => {
    const { result } = renderHook(() => useLocalStorage('counter', 5))
    act(() => {
      result.current[1](prev => prev + 1)
    })
    expect(result.current[0]).toBe(6)
    expect(JSON.parse(localStorage.getItem('counter')!)).toBe(6)
  })

  it('handles corrupted JSON in localStorage gracefully', () => {
    localStorage.setItem('bad-key', 'not-valid-json{{{')
    const { result } = renderHook(() => useLocalStorage('bad-key', 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('persists the latest value to localStorage across updates', () => {
    const { result } = renderHook(() => useLocalStorage('persist-key', 0))
    act(() => {
      result.current[1](10)
    })
    act(() => {
      result.current[1](20)
    })
    expect(result.current[0]).toBe(20)
    expect(JSON.parse(localStorage.getItem('persist-key')!)).toBe(20)
  })

  it('works with string values', () => {
    const { result } = renderHook(() => useLocalStorage('str-key', ''))
    act(() => {
      result.current[1]('hello')
    })
    expect(result.current[0]).toBe('hello')
  })

  it('works with array values', () => {
    const { result } = renderHook(() => useLocalStorage<number[]>('arr-key', []))
    act(() => {
      result.current[1]([1, 2, 3])
    })
    expect(result.current[0]).toEqual([1, 2, 3])
  })

  it('applies migrate function on read when provided', () => {
    localStorage.setItem('migrate-key', JSON.stringify({ assets: [], monthlyExpenses: 100 }))
    const migrate = (raw: unknown) => {
      const r = raw as Record<string, unknown>
      return { ...r, schema_version: 1 } as { assets: unknown[]; monthlyExpenses: number; schema_version: number }
    }
    const { result } = renderHook(() =>
      useLocalStorage('migrate-key', { assets: [], monthlyExpenses: 0, schema_version: 0 }, migrate)
    )
    expect(result.current[0].schema_version).toBe(1)
  })

  it('uses initialValue when migrate function is provided but key is missing', () => {
    const migrate = (raw: unknown) => ({ value: (raw as { value?: number })?.value ?? 0 })
    const { result } = renderHook(() =>
      useLocalStorage('missing-key', { value: 99 }, migrate)
    )
    // When key doesn't exist, initialValue is used
    expect(result.current[0]).toEqual({ value: 99 })
  })
})
