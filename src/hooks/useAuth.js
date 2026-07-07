import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

// session: undefined (in caricamento) | null (non autenticato) | Session
// profile: la riga users corrispondente, stessa convenzione di stati
export function useAuth() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (session === null) {
      setProfile(null)
      return
    }
    let active = true
    supabase
      .from('users')
      .select('id, name, role, territory_id, discipline')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setProfile(data ?? null)
      })
    return () => {
      active = false
    }
  }, [session])

  return { session, profile }
}
