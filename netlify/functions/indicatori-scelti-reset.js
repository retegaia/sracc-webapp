// POST /api/indicatori-scelti/reset — riporta una selezione indicatori a
// bozza vuota (indicatori: [], status: 'draft') senza cancellare la riga,
// stesso pattern di contributions-reset.js.
//
// Permessi: il coordinatore può resettare qualunque riga del territorio.
// Il referente può resettare solo le proprie righe (user_id ===
// caller.id) — questa tabella non ha un concetto di validazione
// equivalente a contributions (v. indicatori-scelti.js), quindi non c'è
// uno stato "bloccato per i referenti" da replicare qui: consentito sia su
// draft che su submitted.
//
// Nota (segnalata prima di procedere, confermata da Andrea): resettare qui
// non tocca automaticamente l'eventuale contributions collegata alla
// stessa combinazione, e viceversa contributions-reset.js non tocca questa
// tabella — sono due azioni indipendenti per design. L'unico punto dove
// questo potrebbe creare una riga "orfana" (indicatori_scelti popolata su
// un field la cui contributions è tornata draft) è segnalato con un avviso
// non bloccante nel form admin (ResetScheda.jsx), non gestito qui.
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

  if (caller.role !== 'coordinator' && user_id !== caller.id) {
    return json({ error: 'non autorizzato' }, 403)
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('indicatori_scelti')
    .select('id')
    .eq('territory_id', caller.territory_id)
    .eq('user_id', user_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .maybeSingle()
  if (fetchErr) return json({ error: fetchErr.message }, 500)
  if (!existing) return json({ error: 'nessuna selezione trovata per questa combinazione' }, 404)

  const { data, error } = await supabase
    .from('indicatori_scelti')
    .update({ indicatori: [], status: 'draft', updated_at: new Date().toISOString() })
    .eq('territory_id', caller.territory_id)
    .eq('user_id', user_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .select()
    .single()
  if (error) return json({ error: error.message }, 500)

  return json({ indicatori_scelti: data })
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
