// GET/POST /api/raci — GET implementato in S8 (§3.1 Tab.2: "Restituisce la
// matrice RACI del territorio, solo coordinatore"). POST non è nella
// specifica originale (Tab.2 elenca solo GET) — aggiunto in S8 per rendere
// possibile il RACI editor dell'AdminPanel: upsert di una singola
// assegnazione (stessa unique constraint dello schema:
// territory_id+user_id+sistema+pericolo+field), o cancellazione se
// role è null/assente, per restare sulla stessa coppia di verbi
// GET/POST già usata da tutte le altre Function di questo repo (nessun
// PATCH/DELETE altrove).
import { json, getServiceClient, getCallerUser } from './_lib/auth.js'

const ROLES = ['R', 'A', 'C', 'I']

async function handleGet(supabase, caller) {
  const { data, error } = await supabase
    .from('raci')
    .select('*, users(name, discipline)')
    .eq('territory_id', caller.territory_id)
    .order('sistema')
    .order('pericolo')
    .order('field')
  if (error) return json({ error: error.message }, 500)
  return json({ raci: data })
}

async function handlePost(req, supabase, caller) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { user_id, sistema, pericolo, field, role } = body ?? {}
  if (!user_id || !sistema || !pericolo || !field) {
    return json({ error: 'user_id, sistema, pericolo e field sono obbligatori' }, 400)
  }

  const { data: targetUser, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('id', user_id)
    .eq('territory_id', caller.territory_id)
    .maybeSingle()
  if (userErr) return json({ error: userErr.message }, 500)
  if (!targetUser) return json({ error: 'utente non trovato in questo territorio' }, 404)

  if (role == null) {
    const { error } = await supabase
      .from('raci')
      .delete()
      .eq('territory_id', caller.territory_id)
      .eq('user_id', user_id)
      .eq('sistema', sistema)
      .eq('pericolo', pericolo)
      .eq('field', field)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, deleted: true })
  }

  if (!ROLES.includes(role)) return json({ error: 'role non valido (R, A, C o I)' }, 400)

  const { data, error } = await supabase
    .from('raci')
    .upsert(
      { territory_id: caller.territory_id, user_id, sistema, pericolo, field, role },
      { onConflict: 'territory_id,user_id,sistema,pericolo,field' }
    )
    .select()
    .single()
  if (error) return json({ error: error.message }, 500)
  return json({ raci: data })
}

export default async (req) => {
  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const caller = await getCallerUser(supabase, req.headers.get('authorization'))
  if (!caller) return json({ error: 'non autenticato' }, 401)
  if (caller.role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)

  try {
    if (req.method === 'GET') return await handleGet(supabase, caller)
    if (req.method === 'POST') return await handlePost(req, supabase, caller)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
  return json({ error: 'method not allowed' }, 405)
}
