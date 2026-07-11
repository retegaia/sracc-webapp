// GET /api/impatti?sistema=&pericolo=&field= — libreria di sola lettura
// degli impatti attesi (modulo di export delle catene d'impatto,
// 2026-07-10). Stesso pattern di factors.js: tutti i filtri opzionali,
// unione di libreria condivisa (territory_id NULL) e territoriale.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller

  const url = new URL(req.url)
  const sistema = url.searchParams.get('sistema')
  const pericolo = url.searchParams.get('pericolo')
  const field = url.searchParams.get('field')

  const applyFilters = (query) => {
    if (sistema) query = query.eq('sistema', sistema)
    if (pericolo) query = query.eq('pericolo', pericolo)
    if (field) query = query.eq('field', field)
    return query
  }

  const cols = 'id, territory_id, sistema, pericolo, field, impatto, ordine'

  const [territoriali, condivisi] = await Promise.all([
    applyFilters(
      supabase.from('impatti_attesi').select(cols).eq('territory_id', caller.territory_id)
    ),
    applyFilters(supabase.from('impatti_attesi').select(cols).is('territory_id', null)),
  ])

  if (territoriali.error) return json({ error: territoriali.error.message }, 500)
  if (condivisi.error) return json({ error: condivisi.error.message }, 500)

  const impatti = [...territoriali.data, ...condivisi.data].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
  return json({ impatti })
}
