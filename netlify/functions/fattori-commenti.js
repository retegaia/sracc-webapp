// GET/POST /api/fattori-commenti — modulo commenti (2026-07-15): stesso
// spazio di discussione append-only di indicatori-commenti.js, ma per i
// fattori. Un fattore citato in una contribution può essere di libreria o
// "free" (testo libero, nessun id proprio — v. FactorChips.jsx), quindi il
// commento si aggancia alla combinazione territorio+sistema+pericolo+
// field+nome invece che a un id — stessa granularità con cui GET
// /api/fattori-in-contesto espone i fattori usati in una combinazione (v.
// quel file per il dettaglio del problema di lettura che risolve a monte).
//
// Autorizzazione: qualunque ruolo diverso da 'observer' (esclusione, non
// whitelist), nessun controllo RACI — stessa eccezione locale di
// indicatori-commenti.js rispetto al resto del progetto.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

async function handleGet(req, supabase, caller) {
  const url = new URL(req.url)
  const sistema = url.searchParams.get('sistema')
  const pericolo = url.searchParams.get('pericolo')
  const field = url.searchParams.get('field')
  const fattoreNome = url.searchParams.get('fattore_nome')
  if (!sistema || !pericolo || !field || !fattoreNome) {
    return json({ error: 'sistema, pericolo, field e fattore_nome sono obbligatori' }, 400)
  }

  const { data, error } = await supabase
    .from('fattori_commenti')
    .select('*, users(name, discipline)')
    .eq('territory_id', caller.territory_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .eq('fattore_nome', fattoreNome)
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

  const { sistema, pericolo, field, fattore_nome, testo } = body ?? {}
  if (!sistema || !pericolo || !field || !fattore_nome || !testo?.trim()) {
    return json({ error: 'sistema, pericolo, field, fattore_nome e testo sono obbligatori' }, 400)
  }

  const { data, error } = await supabase
    .from('fattori_commenti')
    .insert({
      territory_id: caller.territory_id,
      sistema,
      pericolo,
      field,
      fattore_nome,
      user_id: caller.id,
      testo: testo.trim(),
    })
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
  if (caller.role === 'observer') return json({ error: 'non autorizzato' }, 403)

  try {
    if (req.method === 'GET') return await handleGet(req, supabase, caller)
    if (req.method === 'POST') return await handlePost(req, supabase, caller)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
  return json({ error: 'method not allowed' }, 405)
}
