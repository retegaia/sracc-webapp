import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

// Senza SMTP custom, Supabase non permette di personalizzare il template
// email con un token in path (v. nota S2): il client rileva la sessione da
// solo dai parametri che Supabase aggiunge al redirect (detectSessionInUrl,
// attivo di default), quindi qui non leggiamo alcun :token — solo lo stato.
const TIMEOUT_MS = 4000

export default function MagicLinkAuth() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('verificando')

  useEffect(() => {
    let settled = false

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled) return
      if (event === 'SIGNED_IN' && session) {
        settled = true
        navigate('/', { replace: true })
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!settled && data.session) {
        settled = true
        navigate('/', { replace: true })
      }
    })

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        setStatus('errore')
      }
    }, TIMEOUT_MS)

    return () => {
      clearTimeout(timeout)
      listener.subscription.unsubscribe()
    }
  }, [navigate])

  if (status === 'errore') {
    return <p>Link non valido o scaduto. Richiedi un nuovo invito al coordinatore.</p>
  }
  return <p>Verifica dell&rsquo;accesso in corso&hellip;</p>
}
