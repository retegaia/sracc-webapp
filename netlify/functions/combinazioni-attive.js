// GET/POST/DELETE /api/combinazioni-attive — quali sistema×pericolo×field
// sono attivi per il territorio del chiamante (2026-07-16, tabella
// combinazioni_attive, v. supabase/schema.sql). Sorgente della tassonomia
// per StepSelector.jsx (form di compilazione) e RaciEditor.jsx
// (assegnazione referente) tramite useActiveTaxonomy() — a differenza di
// GET /api/factors (libreria condivisa di fattori suggeriti, invariata,
// usata anche da HeatMap.jsx e ResetScheda.jsx per la tassonomia COMPLETA
// non filtrata: quelle due viste devono restare raggiungibili anche su
// combinazioni/dati storici non più "attive"), questo endpoint è sempre e
// solo territory-scoped, mai condiviso (la tabella ha territory_id NOT
// NULL per design).
//
// GET resta aperto a qualunque chiamante autenticato con territorio
// risolto (come prima — StepSelector lo chiama anche per un contributor).
// POST (attiva) e DELETE (disattiva), aggiunti il 2026-07-16 per
// CombinazioniManager.jsx (tab "Combinazioni" in /admin), sono
// coordinator-only, stesso pattern di guardia di users.js: decidono la
// portata del lavoro per l'intero territorio, alla pari di
// un'assegnazione RACI o di un cambio ruolo. Entrambi idempotenti — usano
// DELETE con METODO HTTP invece del pattern POST-con-flag-null già usato
// altrove (v. raci.js) perché richiesto esplicitamente da Andrea per
// questo endpoint, non un'incoerenza involontaria con lo stile del resto
// del repo.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

async function handleGet(supabase, caller) {
  const { data, error } = await supabase
    .from('combinazioni_attive')
    .select('sistema, pericolo, field')
    .eq('territory_id', caller.territory_id)
  if (error) return json({ error: error.message }, 500)

  return json({ combinazioni: data })
}

async function readCombo(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return { errorResponse: json({ error: 'body JSON non valido' }, 400) }
  }
  const { sistema, pericolo, field } = body ?? {}
  if (!sistema || !pericolo || !field) {
    return { errorResponse: json({ error: 'sistema, pericolo e field sono obbligatori' }, 400) }
  }
  return { combo: { sistema, pericolo, field } }
}

// Upsert idempotente: attivare una combinazione già attiva non deve dare
// errore (onConflict sulla stessa unique constraint della tabella,
// territory_id+sistema+pericolo+field).
async function handlePost(req, supabase, caller) {
  const result = await readCombo(req)
  if (result.errorResponse) return result.errorResponse

  const { error } = await supabase
    .from('combinazioni_attive')
    .upsert(
      { territory_id: caller.territory_id, ...result.combo },
      { onConflict: 'territory_id,sistema,pericolo,field', ignoreDuplicates: true }
    )
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// Idempotente anche in cancellazione: disattivare una combinazione già
// inattiva (o mai attivata) non deve dare errore — DELETE su 0 righe non è
// un errore per Postgres/PostgREST.
async function handleDelete(req, supabase, caller) {
  const result = await readCombo(req)
  if (result.errorResponse) return result.errorResponse

  const { error } = await supabase
    .from('combinazioni_attive')
    .delete()
    .eq('territory_id', caller.territory_id)
    .eq('sistema', result.combo.sistema)
    .eq('pericolo', result.combo.pericolo)
    .eq('field', result.combo.field)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

export default async (req) => {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller

  if (req.method === 'GET') return await handleGet(supabase, caller)

  if (caller.role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)
  if (req.method === 'POST') return await handlePost(req, supabase, caller)
  return await handleDelete(req, supabase, caller)
}
