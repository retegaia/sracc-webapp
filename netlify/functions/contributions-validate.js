// POST /api/contributions/validate — S10 (§10 v4 Tab.7): marca 'validated'
// tutti i contributi esistenti per una combinazione sistema/pericolo/field,
// sbloccando la Fase 2 (pesatura indicatori) su quel field. Solo
// coordinator, come raci.js.
//
// Regola C1 (confermata da Andrea): richiede che TUTTI i contributi
// esistenti per la combinazione siano almeno 'submitted' — nel caso comune
// di un solo referente per field equivale a "quel referente ha sottomesso",
// ma la regola è scritta sull'intero insieme dei contributi della
// combinazione (non su un singolo contributo) per restare corretta anche
// se in futuro più co-referenti (R/A multipli) lavorano sullo stesso field.
import { json, getServiceClient, getCallerUser } from './_lib/auth.js'

async function handlePost(req, supabase, caller) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { sistema, pericolo, field } = body ?? {}
  if (!sistema || !pericolo || !field) {
    return json({ error: 'sistema, pericolo e field sono obbligatori' }, 400)
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('contributions')
    .select('id, status')
    .eq('territory_id', caller.territory_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
  if (fetchErr) return json({ error: fetchErr.message }, 500)

  if (!existing.length) {
    return json({ error: 'nessun contributo trovato per questa combinazione' }, 404)
  }

  const notSubmitted = existing.some((c) => c.status === 'draft')
  if (notSubmitted) {
    return json({ error: 'non tutti i contributi per questa combinazione sono stati sottomessi' }, 409)
  }

  const { data, error: updErr } = await supabase
    .from('contributions')
    .update({ status: 'validated', updated_at: new Date().toISOString() })
    .eq('territory_id', caller.territory_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .select()
  if (updErr) return json({ error: updErr.message }, 500)

  return json({ contributions: data })
}

export default async (req) => {
  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const caller = await getCallerUser(supabase, req.headers.get('authorization'))
  if (!caller) return json({ error: 'non autenticato' }, 401)
  if (caller.role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)

  try {
    if (req.method === 'POST') return await handlePost(req, supabase, caller)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
  return json({ error: 'method not allowed' }, 405)
}
