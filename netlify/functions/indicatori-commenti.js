// GET/POST /api/indicatori-commenti — modulo commenti (2026-07-15): spazio
// di discussione append-only sugli indicatori di libreria, aperto a
// coordinator/contributor senza filtro RACI — chi non ha ruolo R su una
// combinazione partecipa comunque tramite commenti invece di un secondo
// referente scrivente (regola C1, S8 — non toccata da questo modulo).
// Nessun UPDATE/DELETE: come una discussione, i commenti restano.
//
// Territorio: un indicatore di libreria condivisa (indicatori.territory_id
// NULL) è usato da più territori — i commenti restano isolati per
// territorio attivo del chiamante (stesso principio di contributions/
// indicatori_scelti, v. schema.sql), non un forum cross-territorio.
// territory_id non arriva mai dal client: sempre caller.territory_id,
// risolto da resolveCaller/header X-Territory-Id come ovunque nel progetto.
//
// Autorizzazione: qualunque ruolo diverso da 'observer' (esclusione, non
// whitelist — v. verifica ruolo osservatore, 2026-07-15), nessun controllo
// RACI. Eccezione locale rispetto al resto del progetto: l'osservatore
// vede tutto il territorio in lettura ovunque tranne qui e in
// fattori-commenti.js — decisione esplicita di Andrea, non un'omissione.
import { json, getServiceClient, resolveCaller, denyObserver } from './_lib/auth.js'

async function handleGet(req, supabase, caller) {
  const url = new URL(req.url)
  const indicatoreId = url.searchParams.get('indicatore_id')
  if (!indicatoreId) return json({ error: 'indicatore_id è obbligatorio' }, 400)

  const { data, error } = await supabase
    .from('indicatori_commenti')
    .select('*, users(name, discipline)')
    .eq('territory_id', caller.territory_id)
    .eq('indicatore_id', indicatoreId)
    .order('created_at', { ascending: true })
  if (error) return json({ error: error.message }, 500)

  return json({ commenti: data })
}

async function handlePost(req, supabase, caller) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { indicatore_id, testo } = body ?? {}
  if (!indicatore_id || !testo?.trim()) {
    return json({ error: 'indicatore_id e testo sono obbligatori' }, 400)
  }

  // Audit sicurezza 2026-07-16 (F4): prima l'indicatore_id dal client veniva
  // inserito senza verificare che risolvesse a un indicatore effettivamente
  // visibile a questo territorio — non una fuga (la GET filtra comunque per
  // territory_id + indicatore_id e il territorio non vede gli indicatori
  // privati altrui), ma un riferimento FK non validato che produceva righe
  // orfane/invisibili. Un indicatore è accessibile se condiviso
  // (territory_id NULL) o dello stesso territorio del chiamante — stessa
  // regola di unione applicata in lettura da indicatori.js.
  const { data: ind, error: indErr } = await supabase
    .from('indicatori')
    .select('id, territory_id')
    .eq('id', indicatore_id)
    .maybeSingle()
  if (indErr) return json({ error: indErr.message }, 500)
  if (!ind || (ind.territory_id !== null && ind.territory_id !== caller.territory_id)) {
    return json({ error: 'indicatore non trovato o non accessibile in questo territorio' }, 404)
  }

  const { data, error } = await supabase
    .from('indicatori_commenti')
    .insert({ territory_id: caller.territory_id, indicatore_id, user_id: caller.id, testo: testo.trim() })
    .select('*, users(name, discipline)')
    .single()
  if (error) return json({ error: error.message }, 500)

  return json({ commento: data })
}

export default async (req) => {
  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller
  const denied = denyObserver(caller)
  if (denied) return denied

  try {
    if (req.method === 'GET') return await handleGet(req, supabase, caller)
    if (req.method === 'POST') return await handlePost(req, supabase, caller)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
  return json({ error: 'method not allowed' }, 405)
}
