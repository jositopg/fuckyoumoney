import { useCallback, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { ensureProfile } from '../lib/supabaseData'

export interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  configured: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
      if (data.session?.user) {
        void ensureProfile(data.session.user.id, data.session.user.email)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next?.user) {
        void ensureProfile(next.user.id, next.user.email)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setError('Supabase no está configurado')
      return
    }
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setError('Supabase no está configurado')
      return
    }
    setError(null)
    const { error: err } = await supabase.auth.signUp({ email, password })
    if (err) setError(err.message)
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    setError(null)
    const { error: err } = await supabase.auth.signOut()
    if (err) setError(err.message)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    configured: isSupabaseConfigured,
    error,
    signIn,
    signUp,
    signOut,
    clearError,
  }
}
