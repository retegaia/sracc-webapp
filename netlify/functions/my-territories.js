// GET /api/my-territories — multi-territorio (2026-07-11): unico endpoint
// che non richiede l'header X-Territory-Id, perché serve esattamente a
// scoprire quali territori sono disponibili prima che uno diventi "attivo"
// (v. src/hooks/useTerritorySelection.js, chiamato subito dopo la
// validazione del magic link e da "Cambia territorio"). Restituisce anche
// il ruolo del chiamante per ciascun territorio, perché in generale non è
// lo stesso su tutti (v. user_territories, supabase/schema.sql).
import { json, getServiceClient, getCallerIdentity } from './_lib/auth.js'

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const caller = await getCallerIdentity(supabase, req)
  if (!caller) return json({ error: 'non autenticato' }, 401)

  const { data, error } = await supabase
    .from('user_territories')
    .select('territory_id, role, territories(name, region)')
    .eq('user_id', caller.id)
  if (error) return json({ error: error.message }, 500)

  const territories = data
    .map((row) => ({
      territory_id: row.territory_id,
      name: row.territories?.name ?? '',
      region: row.territories?.region ?? null,
      role: row.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return json({ territories })
}
