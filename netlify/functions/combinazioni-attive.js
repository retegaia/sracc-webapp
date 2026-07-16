// GET /api/combinazioni-attive — quali sistema×pericolo×field sono attivi
// per il territorio del chiamante (2026-07-16, tabella combinazioni_attive,
// v. supabase/schema.sql). Sorgente della tassonomia per StepSelector.jsx
// (form di compilazione) e RaciEditor.jsx (assegnazione referente) tramite
// useActiveTaxonomy() — a differenza di GET /api/factors (libreria
// condivisa di fattori suggeriti, invariata, usata anche da HeatMap.jsx e
// ResetScheda.jsx per la tassonomia COMPLETA non filtrata: quelle due viste
// devono restare raggiungibili anche su combinazioni/dati storici non più
// "attive"), questo endpoint è sempre e solo territory-scoped, mai
// condiviso (la tabella ha territory_id NOT NULL per design).
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller

  const { data, error } = await supabase
    .from('combinazioni_attive')
    .select('sistema, pericolo, field')
    .eq('territory_id', caller.territory_id)
  if (error) return json({ error: error.message }, 500)

  return json({ combinazioni: data })
}
