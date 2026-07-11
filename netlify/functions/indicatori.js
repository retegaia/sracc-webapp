// GET /api/indicatori?sistema=&pericolo=&field=&componente= — libreria di
// sola lettura degli indicatori per la pesatura di Fase 2 (S10, §10 v4).
// Stesso pattern di factors.js/impatti.js: tutti i filtri opzionali, unione
// di libreria condivisa (territory_id NULL) e territoriale.
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
  const componente = url.searchParams.get('componente')

  const applyFilters = (query) => {
    if (sistema) query = query.eq('sistema', sistema)
    if (pericolo) query = query.eq('pericolo', pericolo)
    if (field) query = query.eq('field', field)
    if (componente) query = query.eq('componente', componente)
    return query
  }

  const cols =
    'id, territory_id, nome, componente, categoria, tipologia, sistema, pericolo, field, descrizione, unita_misura, fonte_dato, link_fonte, anno, clima_osservato, clima_futuro_rcp45, referenza, base_layer_gis'

  const [territoriali, condivisi] = await Promise.all([
    applyFilters(supabase.from('indicatori').select(cols).eq('territory_id', caller.territory_id)),
    applyFilters(supabase.from('indicatori').select(cols).is('territory_id', null)),
  ])

  if (territoriali.error) return json({ error: territoriali.error.message }, 500)
  if (condivisi.error) return json({ error: condivisi.error.message }, 500)

  return json({ indicatori: [...territoriali.data, ...condivisi.data] })
}
