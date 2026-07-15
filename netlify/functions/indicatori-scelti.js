// GET/POST /api/indicatori-scelti — Fase 2 (S10, §10 v4 Tab.7): pesatura
// indicatori per field. Stesso pattern di contributions.js (S3/S4):
// GET: coordinatore e observer vedono tutto il territorio, referente solo i
// propri (ruolo observer verificato/completato il 2026-07-15).
// POST: verifica RACI (ruolo R o A) come contributions.js, più una verifica
// aggiuntiva specifica di questa Function — il contributo dello stesso
// referente per lo stesso field deve essere già 'validated' (§10: la Fase 2
// parte solo da field la cui Fase 1 è stata validata dal coordinatore, v.
// contributions-validate.js) — altrimenti 403. Blocco esplicito su
// role === 'observer' prima di qualunque altro controllo, stessa ragione di
// contributions.js: non fidarsi della sola assenza di RACI.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

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

async function isContributionValidated(supabase, { territory_id, user_id, sistema, pericolo, field }) {
  const { data, error } = await supabase
    .from('contributions')
    .select('status')
    .eq('territory_id', territory_id)
    .eq('user_id', user_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .maybeSingle()
  if (error) throw error
  return data?.status === 'validated'
}

async function handleGet(req, supabase, caller) {
  const url = new URL(req.url)
  const sistema = url.searchParams.get('sistema')
  const pericolo = url.searchParams.get('pericolo')

  let query = supabase
    .from('indicatori_scelti')
    .select('*, users(name, discipline)')
    .eq('territory_id', caller.territory_id)

  if (sistema) query = query.eq('sistema', sistema)
  if (pericolo) query = query.eq('pericolo', pericolo)
  if (caller.role !== 'coordinator' && caller.role !== 'observer') query = query.eq('user_id', caller.id)

  const { data, error } = await query
  if (error) return json({ error: error.message }, 500)
  return json({ indicatori_scelti: data })
}

async function handlePost(req, supabase, caller) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  if (caller.role === 'observer') return json({ error: 'non autorizzato' }, 403)

  const { sistema, pericolo, field, indicatori, status } = body ?? {}
  if (!sistema || !pericolo || !field || !Array.isArray(indicatori)) {
    return json({ error: 'sistema, pericolo, field e indicatori (array) sono obbligatori' }, 400)
  }

  const key = { territory_id: caller.territory_id, user_id: caller.id, sistema, pericolo, field }

  const assigned = await isAssigned(supabase, key)
  if (!assigned) return json({ error: 'non sei assegnato (RACI) a questo field' }, 403)

  const validated = await isContributionValidated(supabase, key)
  if (!validated) return json({ error: 'il contributo per questo field non è ancora validato' }, 403)

  const { data, error } = await supabase
    .from('indicatori_scelti')
    .upsert(
      {
        territory_id: caller.territory_id,
        user_id: caller.id,
        sistema,
        pericolo,
        field,
        indicatori,
        status: status ?? 'draft',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'territory_id,user_id,sistema,pericolo,field' }
    )
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
    if (req.method === 'GET') return await handleGet(req, supabase, caller)
    if (req.method === 'POST') return await handlePost(req, supabase, caller)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
  return json({ error: 'method not allowed' }, 405)
}
