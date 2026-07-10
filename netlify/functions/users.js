// GET /api/users — implementato in S8, non elencato in Tab.2 (aggiunto per
// l'AdminPanel: elenco utenti del territorio per la sezione "gestione
// utenti" e per il selettore utente del RACI editor). users ha RLS
// self-read-only (v. supabase/policies.sql, S3) — un elenco completo del
// territorio richiede quindi la service-role key lato server, come le
// altre Function. Solo coordinatore.
import { json, getServiceClient, getCallerUser } from './_lib/auth.js'

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const caller = await getCallerUser(supabase, req.headers.get('authorization'))
  if (!caller) return json({ error: 'non autenticato' }, 401)
  if (caller.role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)

  const { data, error } = await supabase
    .from('users')
    .select('id, name, discipline, role')
    .eq('territory_id', caller.territory_id)
    .order('name')
  if (error) return json({ error: error.message }, 500)

  return json({ users: data })
}
