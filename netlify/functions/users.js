// GET /api/users — implementato in S8, non elencato in Tab.2 (aggiunto per
// l'AdminPanel: elenco utenti del territorio per la sezione "gestione
// utenti" e per il selettore utente del RACI editor). users ha RLS
// self-read-only (v. supabase/policies.sql, S3) — un elenco completo del
// territorio richiede quindi la service-role key lato server, come le
// altre Function. Solo coordinatore.
//
// Multi-territorio (2026-07-11): l'elenco viene da user_territories (chi ha
// davvero accesso al territorio ATTIVO del chiamante), non da
// users.territory_id — quella colonna riflette solo il primo territorio a
// cui un utente è mai stato invitato, non tutti quelli a cui ha accesso
// oggi.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller
  if (caller.role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)

  const { data, error } = await supabase
    .from('user_territories')
    .select('role, users(id, name, discipline)')
    .eq('territory_id', caller.territory_id)
  if (error) return json({ error: error.message }, 500)

  const users = data
    .map((row) => ({ id: row.users.id, name: row.users.name, discipline: row.users.discipline, role: row.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return json({ users })
}
