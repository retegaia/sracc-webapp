// POST /api/territories — creazione di un NUOVO territorio (2026-07-11).
// Endpoint separato da POST /api/territory (singolare, modifica del
// territorio attivo): l'autorizzazione è strutturalmente diversa — qui non
// c'è alcun territorio attivo come prerequisito (getCallerIdentity, non
// resolveCaller), e la regola è "coordinator su ALMENO UNO dei territori
// esistenti", non "coordinator del territorio X". Tenerli distinti evita di
// infilare due semantiche/due controlli di autorizzazione diversi nello
// stesso branch POST di territory.js.
//
// Alla creazione, il chiamante diventa automaticamente coordinator del
// nuovo territorio (riga in user_territories) — è così che un consulente
// che segue più comuni ottiene accesso a un territorio che ha appena
// avviato.
import { json, getServiceClient, getCallerIdentity } from './_lib/auth.js'

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const caller = await getCallerIdentity(supabase, req)
  if (!caller) return json({ error: 'non autenticato' }, 401)

  const { data: coordRow, error: coordErr } = await supabase
    .from('user_territories')
    .select('id')
    .eq('user_id', caller.id)
    .eq('role', 'coordinator')
    .limit(1)
    .maybeSingle()
  if (coordErr) return json({ error: coordErr.message }, 500)
  if (!coordRow) return json({ error: 'non autorizzato — richiede coordinator su almeno un territorio esistente' }, 403)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { name, region } = body ?? {}
  if (!name?.trim()) return json({ error: 'name è obbligatorio' }, 400)

  const { data: territory, error: insErr } = await supabase
    .from('territories')
    .insert({ name: name.trim(), region: region?.trim() || null })
    .select('id, name, region')
    .single()
  if (insErr) return json({ error: insErr.message }, 500)

  const { error: utErr } = await supabase
    .from('user_territories')
    .insert({ user_id: caller.id, territory_id: territory.id, role: 'coordinator' })
  if (utErr) return json({ error: utErr.message }, 500)

  return json({ territory })
}
