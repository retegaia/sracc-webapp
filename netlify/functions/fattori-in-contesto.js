// GET /api/fattori-in-contesto?sistema=&pericolo=&field= — modulo commenti
// (2026-07-15): elenco deduplicato dei nomi di fattore usati nelle
// contribution esistenti per una combinazione, indipendentemente da chi le
// ha scritte. Risolve il problema di lettura a monte del modulo commenti —
// GET /api/contributions filtra per user_id per chi non è coordinator/
// observer (§3.1), quindi un referente senza RACI su questa combinazione
// non vedrebbe altrimenti nemmeno i nomi dei fattori altrui, inclusi quelli
// "free" (testo libero, nessun id di libreria — v. FactorChips.jsx) che
// esistono solo dentro la contribution di chi li ha inseriti.
//
// Espone solo l'identità del fattore (nome, componente, free) — mai
// vulnerabilità, pesi, note o altri campi della scheda: il minimo per
// sapere su cosa commentare, non un modo alternativo di leggere l'intera
// contribution altrui aggirando il filtro di contributions.js.
//
// Autorizzazione: stessa del resto del modulo commenti — qualunque ruolo
// diverso da 'observer' (esclusione, non whitelist, per restare corretta
// se in futuro si aggiungono altri ruoli — v. verifica ruolo osservatore,
// 2026-07-15), nessun controllo RACI: è per questo che questo endpoint
// esiste, per permettere di commentare fuori dal proprio ambito.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller
  if (caller.role === 'observer') return json({ error: 'non autorizzato' }, 403)

  const url = new URL(req.url)
  const sistema = url.searchParams.get('sistema')
  const pericolo = url.searchParams.get('pericolo')
  const field = url.searchParams.get('field')
  if (!sistema || !pericolo || !field) {
    return json({ error: 'sistema, pericolo e field sono obbligatori' }, 400)
  }

  const { data, error } = await supabase
    .from('contributions')
    .select('factors')
    .eq('territory_id', caller.territory_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
  if (error) return json({ error: error.message }, 500)

  const byKey = new Map()
  for (const row of data) {
    for (const f of row.factors ?? []) {
      const key = f.nome?.trim().toLowerCase()
      if (!key) continue
      if (!byKey.has(key)) byKey.set(key, { nome: f.nome, componente: f.componente, free: !!f.free })
    }
  }

  return json({ fattori: [...byKey.values()].sort((a, b) => a.nome.localeCompare(b.nome)) })
}
