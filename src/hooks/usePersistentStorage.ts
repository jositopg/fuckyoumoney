import { useState, useEffect } from 'react'

export type PersistenceStatus = 'unknown' | 'granted' | 'denied' | 'unsupported'

function estadoInicial(): PersistenceStatus {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported'
  return 'unknown'
}

export function usePersistentStorage(): PersistenceStatus {
  const [status, setStatus] = useState<PersistenceStatus>(estadoInicial)

  useEffect(() => {
    if (!navigator.storage?.persist) return

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
