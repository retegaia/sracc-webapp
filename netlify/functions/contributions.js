// GET/POST /api/contributions — implementato in S3/S4 (§3.1)
// GET: filtra per sistema+pericolo. Il coordinatore vede tutti i contributi
// del territorio per quella combinazione; il contributor solo i propri.
// POST: crea o aggiorna un contributo. Verifica una riga RACI (ruolo R o A)
// per (territory_id, user_id, sistema, pericolo, field) prima di scrivere —
// la Function usa la service-role key e bypassa le RLS, quindi questo
// controllo è l'unica autorizzazione applicata alla scrittura.
import { json, getServiceClient, getCallerUser } from './_lib/auth.js'

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
  if (!sistema || !pericolo) return json({ error: 'sistema e pericolo sono obbligatori' }, 400)

  let query = supabase
    .from('contributions')
    .select('*')
    .eq('territory_id', caller.territory_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)

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
        status: status ?? 'draft',
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
