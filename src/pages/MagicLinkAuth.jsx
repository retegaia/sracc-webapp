import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { apiPost } from '../lib/apiClient.js'

// Senza SMTP custom, Supabase non permette di personalizzare il template
// email con un token in path (v. nota S2): il client rileva la sessione da
// solo dai parametri che Supabase aggiunge al redirect (detectSessionInUrl,
// attivo di default), quindi qui non leggiamo alcun :token — solo lo stato.
const TIMEOUT_MS = 4000

// Messaggio identico a quello restituito da POST /api/request-magic-link in
// ogni caso (email registrata o no) — ripetuto qui invece di leggerlo dalla
// risposta perché il messaggio non deve dipendere da cosa l'endpoint
// restituisce davvero (anche un errore di rete non deve mostrare un testo
// diverso, altrimenti la distinzione "risposta uguale sempre" si romperebbe
// proprio nel caso limite in cui più conterebbe).
const REQUEST_GENERIC_MESSAGE = "Se l'indirizzo è registrato, riceverai un'email con il link di accesso."

// Form "richiedi un nuovo magic link" (2026-07-11): risolve l'attrito per
// cui, prima, solo il coordinatore poteva rigenerarne uno a mano via
// POST /api/magic-link. Nessuna informazione sull'esito reale trapela in
// UI: stesso messaggio a prescindere che l'email sia registrata o meno,
// anche se la POST fallisce a livello di rete (v. sopra).
function RequestLinkForm() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | done

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || status === 'sending') return
    setStatus('sending')
    try {
      await apiPost('request-magic-link', { email: email.trim() })
    } catch {
      // intenzionale: stesso esito mostrato anche in caso di errore
    }
    setStatus('done')
  }

  if (status === 'done') {
    return <p>{REQUEST_GENERIC_MESSAGE}</p>
  }

  if (!open) {
    return (
      <p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ background: 'none', border: 'none', color: '#1E4D2B', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}
        >
          Non hai un link o è scaduto? Richiedine uno nuovo
        </button>
      </p>
    )
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <label htmlFor="request-link-email" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
        Email
      </label>
      <input
        id="request-link-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }}
      />
      <button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Invio…' : 'Richiedi link'}
      </button>
    </form>
  )
}

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

  return (
    <div style={{ maxWidth: 360, margin: '48px auto', padding: '0 16px' }}>
      {status === 'errore' && <p>Link non valido o scaduto.</p>}
      {status === 'verificando' && <p>Verifica dell&rsquo;accesso in corso&hellip;</p>}
      <RequestLinkForm />
    </div>
  )
}
