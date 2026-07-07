import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function Dashboard() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <p>Caricamento&hellip;</p>
  if (!session) return <p>Non autenticato. Usa il link ricevuto via email.</p>

  return <p>Sessione attiva per {session.user.email}.</p>
}
