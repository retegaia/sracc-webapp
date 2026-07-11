// GET /api/factors?sistema=&pericolo=&field= — implementato in S3 (§3.1)
// Tutti i filtri sono opzionali: senza filtri restituisce l'intera libreria
// visibile al territorio del chiamante (usato da StepSelector per costruire
// l'albero sistema→pericolo→field); con i tre filtri restituisce i fattori
// di un field specifico (usato da FactorChips).
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

  const cols = 'id, territory_id, nome_std, componente, strato, sistema, pericolo, field, fonte_std, peso_suggerito'

  const [territoriali, condivisi] = await Promise.all([
    applyFilters(
      supabase.from('factors').select(cols).eq('territory_id', caller.territory_id)
    ),
    applyFilters(supabase.from('factors').select(cols).is('territory_id', null)),
  ])

  if (territoriali.error) return json({ error: territoriali.error.message }, 500)
  if (condivisi.error) return json({ error: condivisi.error.message }, 500)

  return json({ factors: [...territoriali.data, ...condivisi.data] })
}
