// GET/POST /api/territory — implementato in S8, non elencato in Tab.2
// (aggiunto per l'AdminPanel, sezione "configurazione territorio"). Solo
// name e region: config (jsonb — pericoli/field attivi, metadati) resta
// fuori scope in S8, nessun'altra parte dell'app lo legge oggi — deviazione
// confermata con Andrea Vallebona il 2026-07-10. Solo coordinatore.
import { json, getServiceClient, getCallerUser } from './_lib/auth.js'

async function handleGet(supabase, caller) {
  const { data, error } = await supabase
    .from('territories')
    .select('id, name, region')
    .eq('id', caller.territory_id)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!data) return json({ error: 'territorio non trovato' }, 404)
  return json({ territory: data })
}

async function handlePost(req, supabase, caller) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { name, region } = body ?? {}
  if (!name?.trim()) return json({ error: 'name è obbligatorio' }, 400)

  const { data, error } = await supabase
    .from('territories')
    .update({ name: name.trim(), region: region?.trim() || null })
    .eq('id', caller.territory_id)
    .select('id, name, region')
    .single()
  if (error) return json({ error: error.message }, 500)
  return json({ territory: data })
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
