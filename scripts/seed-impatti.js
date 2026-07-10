// Import della libreria impatti attesi da Impatti_Attesi_estratti.xlsx nella
// tabella `impatti_attesi` (modulo di export delle catene d'impatto,
// 2026-07-10). Upsert non distruttivo, stesso pattern di seed-library.js:
// le righe già presenti vengono aggiornate solo se l'impatto o l'ordine
// sono cambiati.
import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const XLSX_PATH = path.join(__dirname, '../docs/Impatti_Attesi_estratti.xlsx')
const SHEET_NAME = 'Impatti attesi'

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY richieste (vedi .env.example).')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function dedupKey(r) {
  return [r.sistema, r.pericolo, r.field, r.impatto].join('|||')
}

function loadRows() {
  const wb = XLSX.readFile(XLSX_PATH)
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Foglio "${SHEET_NAME}" non trovato nel file XLSX`)

  // A differenza di SRACC_BG_Libreria_v1.xlsx (seed-library.js), qui la
  // prima riga è già l'header reale — nessuna riga di titolo da saltare.
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null })

  const rows = []
  let skipped = 0
  for (const r of raw) {
    const sistema = r['Sistema']
    const pericolo = r['Pericolo']
    const field = r['Impact Field']
    const impatto = r['Impatto atteso']
    if (!sistema || !pericolo || !field || !impatto) {
      skipped += 1
      continue
    }
    const ordine = r['Ordine']
    rows.push({
      territory_id: null, // libreria condivisa (v. schema.sql)
      sistema: String(sistema).trim(),
      pericolo: String(pericolo).trim(),
      field: String(field).trim(),
      impatto: String(impatto).trim(),
      ordine: Number.isFinite(Number(ordine)) ? Number(ordine) : null,
    })
  }
  if (skipped) console.log(`Righe incomplete saltate: ${skipped}.`)
  return rows
}

async function main() {
  const rows = loadRows()
  console.log(`Lette ${rows.length} righe valide dal foglio "${SHEET_NAME}".`)

  const { data: existing, error: fetchErr } = await supabase
    .from('impatti_attesi')
    .select('id, sistema, pericolo, field, impatto, ordine')
    .is('territory_id', null)
  if (fetchErr) throw fetchErr

  const existingByKey = new Map(existing.map((r) => [dedupKey(r), r]))

  const toInsert = []
  const toUpdate = []
  for (const row of rows) {
    const match = existingByKey.get(dedupKey(row))
    if (!match) {
      toInsert.push(row)
      continue
    }
    if (match.ordine !== row.ordine) toUpdate.push({ id: match.id, ...row })
  }

  console.log(
    `Da inserire: ${toInsert.length}. Da aggiornare: ${toUpdate.length}. Invariati: ${
      rows.length - toInsert.length - toUpdate.length
    }.`
  )

  if (toInsert.length) {
    const { error } = await supabase.from('impatti_attesi').insert(toInsert)
    if (error) throw error
  }

  for (const row of toUpdate) {
    const { id, ...fields } = row
    const { error } = await supabase.from('impatti_attesi').update(fields).eq('id', id)
    if (error) throw error
  }

  console.log('Seed impatti attesi completato.')
}

main().catch((err) => {
  console.error('Errore seed-impatti:', err)
  process.exit(1)
})
