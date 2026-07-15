// GET/POST /api/users — implementato in S8, non elencato in Tab.2 (aggiunto
// per l'AdminPanel: elenco utenti del territorio per la sezione "gestione
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
//
// POST (aggiunto 2026-07-15, verifica ruolo osservatore): modifica il ruolo
// di un utente GIÀ esistente in questo territorio — UPDATE su
// user_territories.role soltanto, mai su users.role (colonna legacy
// separata, riflette solo il primo territorio a cui l'utente è mai stato
// invitato — stesso motivo per cui magic-link.js non la tocca per un utente
// esistente, v. commento lì). Azione distinta dall'invito: non tocca
// Supabase Auth, non invia alcuna email — a differenza di POST
// /api/magic-link, che oggi è l'unico altro modo per cambiare il ruolo di
// un utente esistente in un territorio (upsert su user_territories con
// effetto collaterale di un nuovo invio email), qui il coordinatore può
// correggere un ruolo senza disturbare l'utente.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

const ROLES = ['coordinator', 'contributor', 'observer']

async function handleGet(supabase, caller) {
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

async function handlePost(req, supabase, caller) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { user_id, role } = body ?? {}
  if (!user_id || !role) return json({ error: 'user_id e role sono obbligatori' }, 400)
  if (!ROLES.includes(role)) return json({ error: 'role non valido' }, 400)

  const { data: existing, error: existingErr } = await supabase
    .from('user_territories')
    .select('user_id')
    .eq('user_id', user_id)
    .eq('territory_id', caller.territory_id)
    .maybeSingle()
  if (existingErr) return json({ error: existingErr.message }, 500)
  if (!existing) return json({ error: 'utente non trovato in questo territorio' }, 404)

  const { data, error } = await supabase
    .from('user_territories')
    .update({ role })
    .eq('user_id', user_id)
    .eq('territory_id', caller.territory_id)
    .select('role, users(id, name, discipline)')
    .single()
  if (error) return json({ error: error.message }, 500)

  return json({ user: { id: data.users.id, name: data.users.name, discipline: data.users.discipline, role: data.role } })
}

export default async (req) => {
  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller
  if (caller.role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)

  if (req.method === 'GET') return await handleGet(supabase, caller)
  if (req.method === 'POST') return await handlePost(req, supabase, caller)
  return json({ error: 'method not allowed' }, 405)
}
