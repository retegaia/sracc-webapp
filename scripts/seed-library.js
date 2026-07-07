// Import della libreria fattori da SRACC_BG_Libreria_v1.xlsx nella tabella
// `factors` (§7.1 specifica tecnica). Upsert non distruttivo: i fattori già
// presenti vengono aggiornati solo se strato/fonte/peso sono cambiati.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const XLSX_PATH = path.join(__dirname, '../docs/SRACC_BG_Libreria_v1.xlsx')
const SHEET_NAME = 'Libreria'

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY richieste (vedi .env.example).')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Il file espone i valori estesi con accento; lo schema DB usa i codici
// IN/VR/ST per strato e le stringhe senza accento per componente (§2.1).
const STRATO_MAP = {
  'Invariante nazionale': 'IN',
  'Variabile regionale': 'VR',
  'Specificità territoriale': 'ST',
}

const COMPONENTE_MAP = {
  Esposizione: 'Esposizione',
  Sensibilità: 'Sensibilita',
  'Capacità adattiva': 'Capacita adattiva',
}

const PESI_VALIDI = ['Determinante', 'Rilevante', 'Marginale']

function normPeso(v) {
  const trimmed = v ? String(v).trim() : ''
  return PESI_VALIDI.includes(trimmed) ? trimmed : null
}

function dedupKey(f) {
  return [f.nome_std, f.sistema, f.pericolo, f.field, f.componente].join('|||')
}

function loadRows() {
  const wb = XLSX.readFile(XLSX_PATH)
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Foglio "${SHEET_NAME}" non trovato nel file XLSX`)

  // range: 1 -> salta la riga di titolo; la riga successiva (header reale)
  // diventa la riga delle chiavi per sheet_to_json.
  const raw = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: null })

  const rows = []
  let skipped = 0
  for (const r of raw) {
    const nome_std = r['Nome standardizzato (proposta)']
    const componenteRaw = r['Componente']
    const sistema = r['Sistema']
    const pericolo = r['Pericolo']
    const field = r['Impact Field']

    if (!nome_std || !sistema || !pericolo || !field) {
      skipped += 1
      continue
    }

    const componente = COMPONENTE_MAP[componenteRaw]
    if (!componente) {
      console.warn(`Componente non riconosciuta "${componenteRaw}" per "${nome_std}", riga saltata.`)
      skipped += 1
      continue
    }

    rows.push({
      territory_id: null, // libreria condivisa (§2.1)
      nome_std: String(nome_std).trim(),
      componente,
      strato: STRATO_MAP[r['Strato']] ?? null,
      sistema: String(sistema).trim(),
      pericolo: String(pericolo).trim(),
      field: String(field).trim(),
      fonte_std: r['Fonte standard'] ? String(r['Fonte standard']).trim() : null,
      peso_suggerito: normPeso(r['Peso suggerito']),
    })
  }
  if (skipped) console.log(`Righe incomplete o non riconosciute saltate: ${skipped}.`)
  return rows
}

async function main() {
  const rows = loadRows()
  console.log(`Lette ${rows.length} righe valide dal foglio "${SHEET_NAME}".`)

  const { data: existing, error: fetchErr } = await supabase
    .from('factors')
    .select('id, nome_std, componente, strato, sistema, pericolo, field, fonte_std, peso_suggerito')
    .is('territory_id', null)
  if (fetchErr) throw fetchErr

  const existingByKey = new Map(existing.map((f) => [dedupKey(f), f]))

  const toInsert = []
  const toUpdate = []
  for (const row of rows) {
    const match = existingByKey.get(dedupKey(row))
    if (!match) {
      toInsert.push(row)
      continue
    }
    const changed =
      match.strato !== row.strato ||
      match.fonte_std !== row.fonte_std ||
      match.peso_suggerito !== row.peso_suggerito
    if (changed) toUpdate.push({ id: match.id, ...row })
  }

  console.log(
    `Da inserire: ${toInsert.length}. Da aggiornare: ${toUpdate.length}. Invariati: ${
      rows.length - toInsert.length - toUpdate.length
    }.`
  )

  if (toInsert.length) {
    const { error } = await supabase.from('factors').insert(toInsert)
    if (error) throw error
  }

  for (const row of toUpdate) {
    const { id, ...fields } = row
    const { error } = await supabase.from('factors').update(fields).eq('id', id)
    if (error) throw error
  }

  console.log('Seed libreria completato.')
}

main().catch((err) => {
  console.error('Errore seed-library:', err)
  process.exit(1)
})
