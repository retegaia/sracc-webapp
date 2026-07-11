// Import della libreria indicatori da
// docs/PAC_BarigaduGuilcer_Step_5_Lista_Indicatori_Unificata_v2.xlsx (foglio
// "Indicatori_Unificati") nella tabella `indicatori` (S10, §10 v4 Tab.6/8).
// Stesso pattern generale di seed-library.js, con una differenza: upsert
// bulk (un'unica chiamata .upsert() a lotti, onConflict sulla chiave
// univoca dello schema) invece del loop insert/update a diff di
// seed-library.js/seed-impatti.js — qui non c'è un campo equivalente a
// strato/fonte da confrontare riga per riga.
//
// Colonne reali del foglio (verificate leggendo il file consegnato, non
// ipotizzate — v. COL sotto): sistema e "pericolo climatico" sono colonne
// dirette, NON derivate dal numero di tavola come inizialmente previsto —
// la colonna "tavola" (Tavola_1..Tavola_10) esiste ma è ridondante rispetto
// a sistema+pericolo climatico e non viene usata.
//
// Due normalizzazioni necessarie per allineare le stringhe del foglio a
// quelle già usate in `contributions`/`raci` (verificate via query diretta
// sulle 39 combinazioni migrate il 2026-07-11):
// - "sistema" nel foglio ha un prefisso "Sistema " che nel resto del DB
//   c'è solo per gli Ambienti Naturali, non per l'Insediativo (v. SISTEMA_MAP).
// - "pericolo climatico" usa sempre "Incendi boschivi e di interfaccia",
//   ma nel DB l'Insediativo usa la variante con l'apostrofo ("...e
//   d'interfaccia") — incoerenza reale già presente nei dati, non un
//   refuso: v. normalizePericolo().
//
// Colonne di revisione del foglio esterno (Referente, Commenti, risposte ai
// commenti, Risposte a Guglielmo, note) non vengono lette: restano solo sul
// foglio, non nella libreria condivisa.
//
// "Impact field" è una lista comma-separata: ogni riga del foglio diventa
// una riga per field in `indicatori` (stesso principio di espansione già
// usato altrove in questo repo, es. RACI editor per sistema→pericoli).
//
// "tipologia" (quantitativo/qualitativo) nel foglio include anche valori
// fuori dal CHECK di schema (es. "sociale", refusi come "quantativo") —
// normalizeTipologia() tollera i refusi via startsWith ma mappa tutto ciò
// che non è chiaramente quantitativo/qualitativo a null (categoria/
// descrizione restano comunque leggibili per quelle righe).
import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import readline from 'node:readline'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const XLSX_PATH = path.join(__dirname, '../docs/PAC_BarigaduGuilcer_Step_5_Lista_Indicatori_Unificata_v2.xlsx')
const SHEET_NAME = 'Indicatori_Unificati'
const BATCH_SIZE = 500

const COL = {
  nome: 'nome indicatore',
  tipologiaIndicatore: 'tipologia indicatore', // → componente
  categoria: 'categoria indicatore',
  tipologia: 'tipologia', // quantitativo/qualitativo
  impactField: 'Impact field',
  sistema: 'sistema',
  pericolo: 'pericolo climatico',
  descrizione: 'descrizione',
  unitaMisura: 'unità di misura',
  fonteDato: 'fonte del dato',
  linkFonte: 'link alla fonte di scarico',
  anno: 'anno',
  climaOsservato: 'clima osservato',
  climaFuturoRcp45: 'clima futuro (RCP 4.5)',
  referenza: 'referenza',
  baseLayerGis: 'Nome base layer su GIS',
}

// Colonne di revisione del foglio esterno — elencate solo per documentare
// esplicitamente cosa NON viene importato, non lette da nessuna parte sotto.
const COLONNE_ESCLUSE = ['Referente', 'Commenti', 'risposte ai commenti', 'Risposte a Guglielmo', 'note']

const SISTEMA_MAP = {
  'Sistema Insediativo e delle Infrastrutture': 'Insediativo e delle Infrastrutture',
  'Agricoltura e Allevamento': 'Agricoltura e Allevamento',
  'Sistema degli Ambienti Naturali': 'Sistema degli Ambienti Naturali',
}

function normalizePericolo(sistema, pericoloRaw) {
  const pericolo = str(pericoloRaw)
  if (sistema === 'Insediativo e delle Infrastrutture' && pericolo === 'Incendi boschivi e di interfaccia') {
    return "Incendi boschivi e d'interfaccia"
  }
  return pericolo
}

const WRITE = process.argv.includes('--write')
const SKIP_CONFIRM = process.argv.includes('--yes')
const SAMPLE_COUNT = 5

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY richieste (vedi .env.example).')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function normalizeComponente(raw) {
  const norm = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (norm.startsWith('perico')) return 'Pericolo'
  if (norm.startsWith('esposiz')) return 'Esposizione'
  if (norm.startsWith('sensi')) return 'Sensibilita' // copre anche "sensitività", il refuso presente nel foglio
  if (norm.startsWith('capacit')) return 'Capacita adattiva'
  return null
}

function normalizeTipologia(raw) {
  const norm = String(raw ?? '').trim().toLowerCase()
  if (norm.startsWith('quant')) return 'quantitativo' // copre anche "quantativo"
  if (norm.startsWith('qual')) return 'qualitativo'
  return null
}

function str(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// Number(null) === 0 e Number('') === 0 — senza passare da str() prima, una
// cella "anno" vuota diventerebbe silenziosamente 0 invece di null.
function num(v) {
  const s = str(v)
  if (s === null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function dedupKey(r) {
  return [r.nome, r.sistema, r.pericolo, r.field, r.componente].join('|||')
}

function loadRows() {
  const wb = XLSX.readFile(XLSX_PATH)
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Foglio "${SHEET_NAME}" non trovato nel file XLSX (fogli disponibili: ${wb.SheetNames.join(', ')})`)

  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null })
  const columns = raw.length ? Object.keys(raw[0]) : []
  console.log(`Colonne rilevate nel foglio "${SHEET_NAME}":`, columns)

  const missing = Object.entries(COL).filter(([, header]) => !columns.includes(header))
  if (missing.length) {
    console.warn(
      `Attenzione: ${missing.length} colonne attese in COL non trovate nel foglio — ` +
        `verifica i nomi reali sopra e aggiorna le costanti COL in questo script:\n` +
        missing.map(([key, header]) => `  ${key}: atteso "${header}"`).join('\n')
    )
  }

  const rows = []
  let skipped = 0
  let skippedSistema = 0
  let skippedComponente = 0
  let skippedField = 0
  let tipologiaSconosciuta = 0

  for (const r of raw) {
    const nome = str(r[COL.nome])
    if (!nome) {
      skipped += 1
      continue
    }

    const sistema = SISTEMA_MAP[str(r[COL.sistema])]
    if (!sistema) {
      skippedSistema += 1
      continue
    }
    const pericolo = normalizePericolo(sistema, r[COL.pericolo])

    const componente = normalizeComponente(r[COL.tipologiaIndicatore])
    if (!componente) {
      skippedComponente += 1
      continue
    }

    const fields = String(r[COL.impactField] ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)
    if (!fields.length) {
      skippedField += 1
      continue
    }

    const tipologia = normalizeTipologia(r[COL.tipologia])
    if (r[COL.tipologia] && !tipologia) tipologiaSconosciuta += 1

    const base = {
      nome,
      componente,
      categoria: str(r[COL.categoria]),
      tipologia,
      sistema,
      pericolo,
      descrizione: str(r[COL.descrizione]),
      unita_misura: str(r[COL.unitaMisura]),
      fonte_dato: str(r[COL.fonteDato]),
      link_fonte: str(r[COL.linkFonte]),
      anno: num(r[COL.anno]),
      clima_osservato: str(r[COL.climaOsservato]),
      clima_futuro_rcp45: str(r[COL.climaFuturoRcp45]),
      referenza: str(r[COL.referenza]),
      base_layer_gis: str(r[COL.baseLayerGis]),
    }

    for (const field of fields) {
      rows.push({ territory_id: null, ...base, field })
    }
  }

  console.log(
    `Righe foglio: ${raw.length}. Saltate — nome mancante: ${skipped}, sistema non riconosciuto: ${skippedSistema}, ` +
      `componente non riconosciuta: ${skippedComponente}, Impact Field vuoto: ${skippedField}.`
  )
  if (tipologiaSconosciuta) {
    console.log(`Valori di "tipologia" non quantitativo/qualitativo (es. "sociale") mappati a null: ${tipologiaSconosciuta}.`)
  }

  // Un nome+combinazione può comparire più volte nel foglio sorgente prima
  // dell'espansione per field — dedup finale sulla stessa chiave
  // dell'unique constraint, tenendo l'ultima occorrenza.
  const byKey = new Map(rows.map((r) => [dedupKey(r), r]))
  const deduped = [...byKey.values()]
  if (deduped.length !== rows.length) {
    console.log(`Righe duplicate sulla chiave (nome, sistema, pericolo, field, componente): ${rows.length - deduped.length} (tenuta l'ultima occorrenza).`)
  }

  return deduped
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
  const rows = loadRows()
  console.log(`\n${rows.length} indicatori pronti per l'upsert.\n`)

  console.log(`--- Anteprima (${Math.min(SAMPLE_COUNT, rows.length)} righe) ---\n`)
  for (const r of rows.slice(0, SAMPLE_COUNT)) {
    console.log(JSON.stringify(r, null, 2))
  }

  if (!WRITE) {
    console.log('\nDry-run: nessuna scrittura effettuata. Rilancia con --write per scrivere su Supabase (upsert bulk).')
    return
  }

  if (!rows.length) {
    console.log('\nNessuna riga da scrivere.')
    return
  }

  if (!SKIP_CONFIRM) {
    const ok = await confirm(`\nStai per fare upsert di ${rows.length} righe in indicatori su ${supabaseUrl}. Confermi? (si/no) `)
    if (!ok) {
      console.log('Annullato.')
      return
    }
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('indicatori').upsert(batch, { onConflict: 'nome,sistema,pericolo,field,componente' })
    if (error) throw error
    console.log(`Upsert lotto ${i / BATCH_SIZE + 1}: ${batch.length} righe.`)
  }

  console.log(`\nUpsert completato: ${rows.length} righe in indicatori.`)
}

main().catch((err) => {
  console.error('Errore seed-indicatori:', err)
  process.exit(1)
})
