import { useState, useCallback } from 'react'

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  migrate?: (raw: unknown) => T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      if (item) {
        const parsed: unknown = JSON.parse(item)
        return migrate ? migrate(parsed) : (parsed as T)
      }
      return initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue(prev => {
        const nextValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value
        try {
          localStorage.setItem(key, JSON.stringify(nextValue))
        } catch {
          // Silently ignore storage errors
        }
        return nextValue
      })
    },
    [key]
  )

  return [storedValue, setValue]
}
