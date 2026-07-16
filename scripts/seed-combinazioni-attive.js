// Seed di combinazioni_attive per il territorio Barigadu Guilcer
// (2026-07-16), derivato dalle combinazioni sistema×pericolo×field
// distinte già presenti in `impatti_attesi` (libreria condivisa, 39
// combinazioni/127 righe) — non da `contributions`, che ha 8 combinazioni
// con naming disallineato rispetto a `factors` scoperte nella verifica di
// sola lettura precedente (es. pericolo "Incendi boschivi e d'interfaccia"
// con apostrofo elisa contro "Incendi boschivi e di interfaccia" in
// factors) e da NON usare come fonte per non propagare quel disallineamento
// nella nuova tabella. Upsert non distruttivo (pre-check + insert delle
// sole righe mancanti), stesso principio di seed-impatti.js/seed-library.js
// — rieseguibile senza duplicare righe grazie anche allo unique constraint
// su (territory_id, sistema, pericolo, field).
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY richieste (vedi .env.example).')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TERRITORY_NAME = 'Barigadu Guilcer'

function comboKey(r) {
  return [r.sistema, r.pericolo, r.field].join('|||')
}

async function main() {
  const { data: territory, error: terrErr } = await supabase
    .from('territories')
    .select('id, name')
    .eq('name', TERRITORY_NAME)
    .maybeSingle()
  if (terrErr) throw terrErr
  if (!territory) throw new Error(`Territorio "${TERRITORY_NAME}" non trovato in \`territories\`.`)

  const { data: impatti, error: impErr } = await supabase
    .from('impatti_attesi')
    .select('sistema, pericolo, field')
    .is('territory_id', null)
  if (impErr) throw impErr

  const combos = new Map()
  for (const r of impatti) {
    const key = comboKey(r)
    if (!combos.has(key)) combos.set(key, { territory_id: territory.id, sistema: r.sistema, pericolo: r.pericolo, field: r.field })
  }
  console.log(`Trovate ${combos.size} combinazioni distinte in impatti_attesi (${impatti.length} righe totali).`)

  const { data: existing, error: exErr } = await supabase
    .from('combinazioni_attive')
    .select('sistema, pericolo, field')
    .eq('territory_id', territory.id)
  if (exErr) throw exErr
  const existingKeys = new Set(existing.map(comboKey))

  const toInsert = [...combos.values()].filter((c) => !existingKeys.has(comboKey(c)))
  if (!toInsert.length) {
    console.log(`Nessuna nuova combinazione da inserire per "${TERRITORY_NAME}" (già tutte presenti: ${existingKeys.size}).`)
    return
  }

  const { error: insErr } = await supabase.from('combinazioni_attive').insert(toInsert)
  if (insErr) throw insErr
  console.log(`Inserite ${toInsert.length} nuove combinazioni per "${TERRITORY_NAME}" (già presenti: ${existingKeys.size}).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
