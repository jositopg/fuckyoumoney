import { useState, useEffect } from 'react'

export type PersistenceStatus = 'unknown' | 'granted' | 'denied' | 'unsupported'

export function usePersistentStorage(): PersistenceStatus {
  const [status, setStatus] = useState<PersistenceStatus>('unknown')

  useEffect(() => {
    if (!navigator.storage?.persist) {
      setStatus('unsupported')
      return
    }

    // Check current status first
    navigator.storage.persisted().then(isPersisted => {
      if (isPersisted) {
        setStatus('granted')
        return
      }
      // Request persistent storage
      navigator.storage.persist().then(granted => {
        setStatus(granted ? 'granted' : 'denied')
      })
    })
  }, [])

  return status
}
