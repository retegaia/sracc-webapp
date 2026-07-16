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
//
// Audit sicurezza 2026-07-16 (F3): la verifica di esistenza passa ora dalla
// RPC a tempo costante can_request_magic_link (v. supabase/schema.sql) invece
// della paginazione integrale di auth.users, che faceva variare il tempo di
// risposta con la posizione dell'email nella lista (oracolo temporale) ed era
// una scansione O(tutti-gli-utenti) per ogni richiesta anonima. Fallback alla
// vecchia via se la RPC non è ancora stata migrata, così l'ordine
// deploy-vs-migrazione non rompe il recupero del link. Aggiunto anche un rate
// limit best-effort per IP (v. sotto).
import { createClient } from '@supabase/supabase-js'
import { findAuthUserByEmail, sendMagicLink } from './_lib/authUsers.js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const siteUrl = process.env.SITE_URL

const GENERIC_MESSAGE = "Se l'indirizzo è registrato, riceverai un'email con il link di accesso."

// Rate limit best-effort in-memory (F3): le Function serverless sono stateless
// tra istanze, quindi questa Map limita solo i burst su una singola istanza
// calda — non è una barriera forte (per quella servirebbe uno store condiviso,
// es. una tabella o un KV), ma alza il costo di uno scan massivo da un singolo
// IP senza infrastruttura aggiuntiva. La barriera reale contro l'email bombing
// verso un indirizzo noto resta il cooldown 60s per-email integrato in Supabase
// (verificato l'11/07). Il 429 è per-IP e non dipende dall'email, quindi non
// reintroduce l'oracolo di enumerazione.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 10
const hits = new Map() // ip -> [timestamp, ...] entro la finestra

function clientIp(req) {
  return (
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  )
}

function rateLimited(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  return false
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Esiste un auth.users con questa email E una riga applicativa in public.users?
// Via primaria: RPC a tempo costante. Fallback (se la RPC non è ancora
// migrata): la vecchia paginazione + lookup su users, così un deploy del
// codice prima della migrazione SQL non lascia gli utenti senza login.
async function emailIsEligible(supabase, email) {
  const { data, error } = await supabase.rpc('can_request_magic_link', { p_email: email })
  if (!error) return data === true

  console.warn('request-magic-link: RPC can_request_magic_link non disponibile, fallback a paginazione:', error.message)
  const authUser = await findAuthUserByEmail(supabase, email)
  if (!authUser) return false
  const { data: row, error: rowErr } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle()
  if (rowErr) throw rowErr
  return !!row
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!supabaseUrl || !serviceKey || !siteUrl) return json({ error: 'server non configurato' }, 500)

  if (rateLimited(clientIp(req))) {
    return json({ message: 'Troppe richieste, riprova tra un minuto.' }, 429)
  }

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
    if (await emailIsEligible(supabase, email)) {
      const { error: otpErr } = await sendMagicLink(supabase, email, siteUrl)
      if (otpErr) console.error('request-magic-link: invio fallito (non propagato al client):', otpErr.message)
    }
  } catch (err) {
    console.error('request-magic-link: errore interno (non propagato al client):', err.message)
  }

  return json({ message: GENERIC_MESSAGE })
}
