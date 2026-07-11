// GET/POST /api/contributions — implementato in S3/S4 (§3.1)
// GET: sistema+pericolo+field filtrano una combinazione, ma sono tutti
// opzionali — senza filtri restituisce l'intero territorio (usato da
// CoordinatorView, S4, per caricare Aggregata e Pervasività con una sola
// chiamata). field è stato aggiunto per il prefill del form referente
// (ContributorForm, v. useOwnContribution in useContributions.js): un
// vincolo aggiuntivo sulla query, non un cambio di permessi — il
// contributor riceve già solo le proprie righe (riga sotto), il
// coordinator l'intero territorio come sempre. Il coordinatore vede tutti i
// contributi del territorio; il contributor solo i propri. Include il join
// su users (name, discipline) per mostrare il referente in AggregatedView
// senza una seconda chiamata (la RLS su users permette solo self-read lato
// client, v. supabase/policies.sql — qui serve il join lato server con la
// service-role key).
// POST: crea o aggiorna un contributo. Verifica una riga RACI (ruolo R o A)
// per (territory_id, user_id, sistema, pericolo, field) prima di scrivere —
// la Function usa la service-role key e bypassa le RLS, quindi questo
// controllo è l'unica autorizzazione applicata alla scrittura. Lo status
// non retrocede mai rispetto a quello già salvato (draft < submitted <
// validated, v. maxStatus) — un referente che riapre e risalva un campo
// già validated non lo riporta a submitted/draft.
import { json, getServiceClient, getCallerUser } from './_lib/auth.js'

const STATUS_RANK = { draft: 0, submitted: 1, validated: 2 }

// Non-regressione: lo status salvato è il massimo tra quello già presente e
// quello mandato dal client, non semplicemente quest'ultimo — altrimenti un
// NotesExport che manda sempre 'submitted' (v. NotesExport.jsx) riporta
// indietro una riga già 'validated' dal coordinatore ogni volta che il
// referente la riapre e risalva, rompendo lo sblocco di Fase 2 già concesso
// su quel field (v. GET /api/indicatori-scelti e IndicatorSelector.jsx, che
// leggono status === 'validated').
function maxStatus(a, b) {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

async function isAssigned(supabase, { territory_id, user_id, sistema, pericolo, field }) {
  const { data, error } = await supabase
    .from('raci')
    .select('role')
    .eq('territory_id', territory_id)
    .eq('user_id', user_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .in('role', ['R', 'A'])
    .maybeSingle()
  if (error) throw error
  return !!data
}

async function handleGet(req, supabase, caller) {
  const url = new URL(req.url)
  const sistema = url.searchParams.get('sistema')
  const pericolo = url.searchParams.get('pericolo')
  const field = url.searchParams.get('field')

  let query = supabase
    .from('contributions')
    .select('*, users(name, discipline)')
    .eq('territory_id', caller.territory_id)

  if (sistema) query = query.eq('sistema', sistema)
  if (pericolo) query = query.eq('pericolo', pericolo)
  if (field) query = query.eq('field', field)
  if (caller.role !== 'coordinator') query = query.eq('user_id', caller.id)

  const { data, error } = await query
  if (error) return json({ error: error.message }, 500)
  return json({ contributions: data })
}

async function handlePost(req, supabase, caller) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { sistema, pericolo, field, factors, vulnerability, note, status } = body ?? {}
  if (!sistema || !pericolo || !field || !Array.isArray(factors)) {
    return json({ error: 'sistema, pericolo, field e factors (array) sono obbligatori' }, 400)
  }

  const assigned = await isAssigned(supabase, {
    territory_id: caller.territory_id,
    user_id: caller.id,
    sistema,
    pericolo,
    field,
  })
  if (!assigned) return json({ error: 'non sei assegnato (RACI) a questo field' }, 403)

  const { data: existing, error: existingErr } = await supabase
    .from('contributions')
    .select('status')
    .eq('territory_id', caller.territory_id)
    .eq('user_id', caller.id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .maybeSingle()
  if (existingErr) return json({ error: existingErr.message }, 500)

  const requestedStatus = status ?? 'draft'
  const effectiveStatus = existing ? maxStatus(existing.status, requestedStatus) : requestedStatus

  const { data, error } = await supabase
    .from('contributions')
    .upsert(
      {
        territory_id: caller.territory_id,
        user_id: caller.id,
        sistema,
        pericolo,
        field,
        factors,
        vulnerability: vulnerability ?? null,
        note: note ?? null,
        status: effectiveStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'territory_id,user_id,sistema,pericolo,field' }
    )
    .select()
    .single()

  if (error) return json({ error: error.message }, 500)
  return json({ contribution: data })
}

export default async (req) => {
  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const caller = await getCallerUser(supabase, req.headers.get('authorization'))
  if (!caller) return json({ error: 'non autenticato' }, 401)

  try {
    if (req.method === 'GET') return await handleGet(req, supabase, caller)
    if (req.method === 'POST') return await handlePost(req, supabase, caller)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
  return json({ error: 'method not allowed' }, 405)
}
