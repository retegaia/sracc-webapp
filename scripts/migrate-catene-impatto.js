// Migrazione del lavoro già svolto manualmente sulle catene d'impatto
// (Barigadu Guilcer, Step 3 — Catene_Impatto_v5_REV, aprile 2026) dentro
// `contributions`, per sbloccare da subito la Fase 2 (pesatura indicatori,
// §10) senza dover rifare da zero l'individuazione dei fattori.
//
// Legge docs/Fattori_da_Catene_Impatto.xlsx (foglio "Fattori da catene":
// Sistema, Pericolo, Impact Field, Componente, Nome fattore, Ordine — 503
// righe su 39 combinazioni Sistema+Pericolo+Impact Field) e per ciascuna
// combinazione fa upsert di una riga in `contributions` con:
//   - factors: un elemento per riga del foglio, nella stessa forma che
//     FactorChips.jsx usa per i fattori "a testo libero" aggiunti dal
//     referente (factor_id: null, strato: 'ST', fonte: '' — v.
//     FactorChips.jsx addFree) perché nessuna di queste 503 righe è stata
//     fatta corrispondere alla libreria `factors`: il lavoro precede la
//     libreria. peso resta null (nessuna pesatura nell'analisi originale).
//   - vulnerability: null — nessun livello di rischio nel lavoro originale,
//     non va inventato.
//   - status: 'validated' — sblocca subito la Fase 2 per tutte le 39
//     combinazioni (§10 richiede che i predecessori siano validati).
//   - user_id: il coordinatore esistente (Andrea), individuato via email
//     come in seed-raci.js — lo script NON crea utenti.
//
// L'ordine delle righe nel foglio è già quello corretto per la UI: per
// ciascuna combinazione, le righe sono raggruppate a blocchi contigui per
// Componente e "Ordine" riparte da 1 a ogni blocco (verificato su tutte le
// 39 combinazioni) — quindi si preserva l'ordine di lettura del foglio
// invece di riordinare per "Ordine", che mischierebbe i blocchi.
//
// Upsert (onConflict su territory_id,user_id,sistema,pericolo,field): le
// righe già presenti per il coordinatore su queste 39 combinazioni sono
// dati di test da S3/S4, non lavoro reale — vanno sovrascritte, non
// saltate. Il dry-run elenca comunque quali combinazioni risultano già
// presenti prima della sovrascrittura, per verifica.
//
// Uso:
//   node scripts/migrate-catene-impatto.js            (dry-run, solo log)
//   node scripts/migrate-catene-impatto.js --write     (scrive su Supabase)
//   node scripts/migrate-catene-impatto.js --write --yes  (salta la conferma)
import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import readline from 'node:readline'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const XLSX_PATH = path.join(__dirname, '../docs/Fattori_da_Catene_Impatto.xlsx')
const SHEET_NAME = 'Fattori da catene'
const TERRITORY_NAME = 'Barigadu Guilcer'
const COORDINATOR_EMAIL = 'andrea.vallebona@retegaia.it'
const MIGRATION_NOTE =
  "Migrato da Catene d'Impatto v5 REV (Step 3, aprile 2026) — nessuna pesatura fattori né valutazione di vulnerabilità nell'analisi originale."

const WRITE = process.argv.includes('--write')
const SKIP_CONFIRM = process.argv.includes('--yes')
const SAMPLE_COUNT = 3

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY richieste (vedi .env.example).')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function groupKey(r) {
  return [r.sistema, r.pericolo, r.field].join('|||')
}

function loadGroups() {
  const wb = XLSX.readFile(XLSX_PATH)
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Foglio "${SHEET_NAME}" non trovato nel file XLSX`)
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null })

  const groups = new Map()
  let skipped = 0
  for (const r of raw) {
    const sistema = r['Sistema']
    const pericolo = r['Pericolo']
    const field = r['Impact Field']
    const componente = r['Componente']
    const nome = r['Nome fattore']
    if (!sistema || !pericolo || !field || !componente || !nome) {
      skipped += 1
      continue
    }
    const row = {
      sistema: String(sistema).trim(),
      pericolo: String(pericolo).trim(),
      field: String(field).trim(),
      componente: String(componente).trim(),
      nome: String(nome).trim(),
    }
    const key = groupKey(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  if (skipped) console.log(`Righe incomplete saltate: ${skipped}.`)
  return groups
}

function buildContribution(rows, territoryId, userId) {
  const { sistema, pericolo, field } = rows[0]
  const factors = rows.map((r) => ({
    factor_id: null,
    nome: r.nome,
    componente: r.componente,
    strato: 'ST',
    fonte: '',
    peso: null,
    free: true,
  }))
  return {
    territory_id: territoryId,
    user_id: userId,
    sistema,
    pericolo,
    field,
    factors,
    vulnerability: null,
    note: MIGRATION_NOTE,
    status: 'validated',
  }
}

async function getTerritoryId(name) {
  const { data, error } = await supabase.from('territories').select('id').eq('name', name).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Territorio "${name}" non trovato — va creato prima (v. seed-raci.js).`)
  return data.id
}

async function getUserIdByEmail(email) {
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found.id
    if (data.users.length < 200) break
    page += 1
  }
  throw new Error(`Utente auth non trovato per email ${email} — il coordinatore deve già esistere.`)
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(/^s(i)?$/i.test(answer.trim()))
    })
  })
}

async function main() {
  const groups = loadGroups()
  console.log(`Lette ${[...groups.values()].reduce((a, r) => a + r.length, 0)} righe valide, ${groups.size} combinazioni Sistema+Pericolo+Impact Field.`)

  const territoryId = await getTerritoryId(TERRITORY_NAME)
  const userId = await getUserIdByEmail(COORDINATOR_EMAIL)
  console.log(`Territorio "${TERRITORY_NAME}" (${territoryId}), coordinatore ${COORDINATOR_EMAIL} (${userId}).`)

  const { data: existing, error: fetchErr } = await supabase
    .from('contributions')
    .select('sistema, pericolo, field, status')
    .eq('territory_id', territoryId)
    .eq('user_id', userId)
  if (fetchErr) throw fetchErr
  const existingByKey = new Map(existing.map((r) => [groupKey(r), r]))

  const contributions = [...groups.entries()].map(([key, rows]) =>
    buildContribution(rows, territoryId, userId)
  )
  const alreadyPresent = contributions.filter((c) => existingByKey.has(groupKey(c)))

  console.log(
    `Combinazioni totali da upsert: ${contributions.length}. Già presenti (verranno sovrascritte): ${alreadyPresent.length}. Nuove: ${contributions.length - alreadyPresent.length}.`
  )

  if (alreadyPresent.length) {
    console.log(`\nGià presenti (dati di test S3/S4 — verranno sovrascritte con lo status esistente sostituito da 'validated'):`)
    for (const c of alreadyPresent) {
      const prev = existingByKey.get(groupKey(c))
      console.log(`  - ${c.sistema} / ${c.pericolo} / ${c.field} (status attuale: ${prev.status})`)
    }
  }

  console.log(`\n--- Anteprima (${Math.min(SAMPLE_COUNT, contributions.length)} combinazioni) ---\n`)
  for (const c of contributions.slice(0, SAMPLE_COUNT)) {
    console.log(`${c.sistema} / ${c.pericolo} / ${c.field} — ${c.factors.length} fattori`)
    console.log(JSON.stringify(c, null, 2))
    console.log('')
  }

  if (!WRITE) {
    console.log('Dry-run: nessuna scrittura effettuata. Rilancia con --write per scrivere su Supabase (upsert).')
    return
  }

  if (!SKIP_CONFIRM) {
    const ok = await confirm(
      `\nStai per fare upsert di ${contributions.length} righe in contributions su ${supabaseUrl} con status 'validated' (${alreadyPresent.length} verranno sovrascritte). Confermi? (si/no) `
    )
    if (!ok) {
      console.log('Annullato.')
      return
    }
  }

  const { error: upsertErr } = await supabase
    .from('contributions')
    .upsert(contributions, { onConflict: 'territory_id,user_id,sistema,pericolo,field' })
  if (upsertErr) throw upsertErr
  console.log(`\nUpsert completato: ${contributions.length} righe in contributions.`)
}

main().catch((err) => {
  console.error('Errore migrate-catene-impatto:', err)
  process.exit(1)
})
