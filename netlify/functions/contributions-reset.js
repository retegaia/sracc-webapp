// POST /api/contributions/reset — riporta una scheda contributions a bozza
// vuota (factors: [], vulnerability: null, note: null, status: 'draft')
// senza cancellare la riga: stesso UPDATE in place di
// contributions-validate.js, updated_at resta come traccia di quando è
// avvenuto il reset. Nessuna cancellazione, nessuna reinserzione.
//
// Permessi (decisi con Andrea): il coordinatore può resettare qualunque
// scheda del territorio, in qualunque stato — incluse le validated, stesso
// bypass RACI già usato altrove (v. contributions-validate.js). Il
// referente può resettare solo le proprie schede (user_id === caller.id),
// e solo se non sono già validated — solo il coordinatore può disfare una
// validazione. L'observer non può mai scrivere qui (blocco esplicito
// all'inizio di handlePost, 2026-07-15) — senza quel blocco sarebbe
// comunque bloccato indirettamente (non ha mai una propria riga da
// resettare, quindi il lookup sotto risponderebbe 404), ma un controllo
// esplicito è più solido e coerente con "l'osservatore non scrive in
// nessun punto, senza eccezioni".
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

async function handlePost(req, supabase, caller) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  if (caller.role === 'observer') return json({ error: 'non autorizzato' }, 403)

  const { sistema, pericolo, field, user_id } = body ?? {}
  if (!sistema || !pericolo || !field || !user_id) {
    return json({ error: 'sistema, pericolo, field e user_id sono obbligatori' }, 400)
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('contributions')
    .select('id, status')
    .eq('territory_id', caller.territory_id)
    .eq('user_id', user_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .maybeSingle()
  if (fetchErr) return json({ error: fetchErr.message }, 500)
  if (!existing) return json({ error: 'nessun contributo trovato per questa combinazione' }, 404)

  if (caller.role !== 'coordinator') {
    if (user_id !== caller.id) return json({ error: 'non autorizzato' }, 403)
    if (existing.status === 'validated') {
      return json({ error: 'una scheda già validata può essere resettata solo dal coordinatore' }, 403)
    }
  }

  const { data, error } = await supabase
    .from('contributions')
    .update({ factors: [], vulnerability: null, note: null, status: 'draft', updated_at: new Date().toISOString() })
    .eq('territory_id', caller.territory_id)
    .eq('user_id', user_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .select()
    .single()
  if (error) return json({ error: error.message }, 500)

  return json({ contribution: data })
}

export default async (req) => {
  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller

  try {
    if (req.method === 'POST') return await handlePost(req, supabase, caller)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
  return json({ error: 'method not allowed' }, 405)
}
