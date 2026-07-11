// POST /api/request-magic-link — pubblico, nessuna autenticazione (a
// differenza di /api/magic-link, riservato al coordinatore per l'invito di
// nuovi referenti da /admin). Risolve un attrito reale (2026-07-11): senza
// SMTP custom il magic link Supabase scade in 24h ed è a uso singolo (§2.1),
// e prima di questo endpoint l'unico modo per riottenerne uno era chiedere
// al coordinatore di generarlo a mano.
//
// Non è un form di registrazione: NON crea utenti. Verifica che l'email
// corrisponda a un utente Supabase Auth che ha anche una riga in `users`
// (cioè creato dal coordinatore via /admin, non un residuo di auth.users
// senza riga applicativa) — solo in quel caso invia il link, riusando
// esattamente la stessa sendMagicLink() di magic-link.js.
//
// Risposta identica in ogni caso (email trovata, non trovata, o qualunque
// errore incontrato — incluso un eventuale throttling di Supabase su invii
// ravvicinati alla stessa email, verificato empiricamente l'11/07: nessuna
// differenza di status code o messaggio) — altrimenti confrontando le
// risposte si potrebbe dedurre quali email sono registrate nel sistema.
import { createClient } from '@supabase/supabase-js'
import { findAuthUserByEmail, sendMagicLink } from './_lib/authUsers.js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const siteUrl = process.env.SITE_URL

const GENERIC_MESSAGE = "Se l'indirizzo è registrato, riceverai un'email con il link di accesso."

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!supabaseUrl || !serviceKey || !siteUrl) return json({ error: 'server non configurato' }, 500)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!email) return json({ error: 'email obbligatoria' }, 400)

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Qualunque esito interno (email non trovata, nessuna riga users,
  // throttling Supabase, errore imprevisto) produce la stessa risposta
  // 200 generica — solo loggato lato server per visibilità operativa, mai
  // propagato al chiamante.
  try {
    const authUser = await findAuthUserByEmail(supabase, email)
    if (authUser) {
      const { data: row, error: rowErr } = await supabase
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle()
      if (rowErr) throw rowErr
      if (row) {
        const { error: otpErr } = await sendMagicLink(supabase, email, siteUrl)
        if (otpErr) console.error('request-magic-link: invio fallito (non propagato al client):', otpErr.message)
      }
    }
  } catch (err) {
    console.error('request-magic-link: errore interno (non propagato al client):', err.message)
  }

  return json({ message: GENERIC_MESSAGE })
}
