// Duplicazione contenuti tra territori: quando si apre un nuovo territorio
// con lo stesso team/RACI di uno già avviato, dà ai referenti un punto di
// partenza già scritto invece di un form vuoto (raci, combinazioni_attive,
// contributions) invece di ripartire da zero.
//
// Operazione una tantum per una coppia sorgente/destinazione, non pensata
// per essere rilanciata più volte sulla stessa coppia — nessuna UI, stesso
// pattern degli altri script one-off di questo repo (dry-run di default,
// --write per scrivere, stesso principio di upsert non distruttivo di
// migrate-catene-impatto.js).
//
// Copiate integralmente, nessun filtro per sistema/pericolo/field:
//   - raci: stesso user_id/sistema/pericolo/field/role
//   - combinazioni_attive: stesso sistema/pericolo/field
//   - contributions: stessi factors/vulnerability/note, MA status sempre
//     forzato a 'draft' sulla destinazione (anche se il sorgente era
//     'submitted'/'validated' — un territorio nuovo non eredita contenuti
//     "ufficiali" senza revisione del coordinatore su quel contesto).
//
// Esclusi deliberatamente, non letti nemmeno dal sorgente:
//   - indicatori_scelti (restano bloccati finché la contribution non è di
//     nuovo 'validated' sulla destinazione — copiarli non servirebbe)
//   - indicatori_commenti / fattori_commenti (il nuovo territorio parte
//     senza commenti)
//   - locks (blocco ottimistico transitorio, non ha senso duplicarlo)
//
// Upsert non distruttivo sulle stesse unique constraint della tabella
// (territory_id,user_id,sistema,pericolo,field per raci/contributions;
// territory_id,sistema,pericolo,field per combinazioni_attive): una riga
// già presente sulla destinazione con la stessa chiave viene sovrascritta
// con i dati del sorgente, non saltata né duplicata. Il dry-run elenca
// sempre questi conflitti prima di qualunque scrittura.
//
// IMPORTANTE — prerequisito non gestito da questo script: copiare righe
// `raci` con lo stesso user_id NON dà a quegli utenti accesso al territorio
// destinazione. L'autorizzazione passa da `user_territories` (§14), non da
// `raci`. Se gli utenti copiati non hanno già una riga user_territories per
// la destinazione, ricevono comunque 403 in fase di selezione territorio —
// va concesso l'accesso separatamente (flusso di invito esistente via
// /admin / magic-link.js).
//
// Uso:
//   node scripts/duplicate-territory.js <sorgente> <destinazione>              (dry-run, solo log)
//   node scripts/duplicate-territory.js <sorgente> <destinazione> --write      (scrive su Supabase, upsert)
//   node scripts/duplicate-territory.js <sorgente> <destinazione> --write --yes  (salta la conferma)
// <sorgente>/<destinazione> possono essere il nome esatto (territories.name)
// o l'id uuid del territorio.
import 'dotenv/config'
import readline from 'node:readline'
import { createClient } from '@supabase/supabase-js'

const WRITE = process.argv.includes('--write')
const SKIP_CONFIRM = process.argv.includes('--yes')
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const [SOURCE_ARG, DEST_ARG] = positional

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY richieste (vedi .env.example).')
  process.exit(1)
}
if (!SOURCE_ARG || !DEST_ARG) {
  console.error('Uso: node scripts/duplicate-territory.js <sorgente> <destinazione> [--write] [--yes]')
  console.error('<sorgente>/<destinazione>: nome esatto o id uuid del territorio.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function resolveTerritory(ref) {
  const query = supabase.from('territories').select('id, name')
  const { data, error } = UUID_RE.test(ref)
    ? await query.eq('id', ref).maybeSingle()
    : await query.eq('name', ref).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Territorio "${ref}" non trovato in \`territories\`.`)
  return data
}

function raciKey(r) {
  return [r.user_id, r.sistema, r.pericolo, r.field].join('|||')
}
function comboKey(r) {
  return [r.sistema, r.pericolo, r.field].join('|||')
}
function contribKey(r) {
  return [r.user_id, r.sistema, r.pericolo, r.field].join('|||')
}

async function fetchAll(table, columns, territoryId) {
  const { data, error } = await supabase.from(table).select(columns).eq('territory_id', territoryId)
  if (error) throw error
  return data
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
  const source = await resolveTerritory(SOURCE_ARG)
  const dest = await resolveTerritory(DEST_ARG)
  if (source.id === dest.id) {
    throw new Error('Sorgente e destinazione coincidono — niente da duplicare.')
  }
  console.log(`Sorgente: "${source.name}" (${source.id})`)
  console.log(`Destinazione: "${dest.name}" (${dest.id})\n`)

  const [srcRaci, srcCombo, srcContrib, destRaci, destCombo, destContrib] = await Promise.all([
    fetchAll('raci', 'user_id, sistema, pericolo, field, role', source.id),
    fetchAll('combinazioni_attive', 'sistema, pericolo, field', source.id),
    fetchAll('contributions', 'user_id, sistema, pericolo, field, factors, vulnerability, note, status', source.id),
    fetchAll('raci', 'user_id, sistema, pericolo, field', dest.id),
    fetchAll('combinazioni_attive', 'sistema, pericolo, field', dest.id),
    fetchAll('contributions', 'user_id, sistema, pericolo, field, status', dest.id),
  ])

  const destRaciKeys = new Set(srcRaci.length ? destRaci.map(raciKey) : [])
  const destComboKeys = new Set(srcCombo.length ? destCombo.map(comboKey) : [])
  const destContribKeys = new Map(srcContrib.length ? destContrib.map((r) => [contribKey(r), r]) : [])

  const raciConflicts = srcRaci.filter((r) => destRaciKeys.has(raciKey(r)))
  const comboConflicts = srcCombo.filter((r) => destComboKeys.has(comboKey(r)))
  const contribConflicts = srcContrib.filter((r) => destContribKeys.has(contribKey(r)))

  console.log('--- Riepilogo ---')
  console.log(`raci: ${srcRaci.length} righe da copiare (${raciConflicts.length} in conflitto con righe già esistenti sulla destinazione, verrebbero sovrascritte).`)
  console.log(`combinazioni_attive: ${srcCombo.length} righe da copiare (${comboConflicts.length} in conflitto).`)
  console.log(`contributions: ${srcContrib.length} righe da copiare, status forzato a 'draft' sulla destinazione (${contribConflicts.length} in conflitto).`)

  if (raciConflicts.length) {
    console.log(`\nConflitti raci (stesso user_id+sistema+pericolo+field già presente su "${dest.name}"):`)
    for (const r of raciConflicts) console.log(`  - ${r.user_id} / ${r.sistema} / ${r.pericolo} / ${r.field} (role sorgente: ${r.role})`)
  }
  if (comboConflicts.length) {
    console.log(`\nConflitti combinazioni_attive (già attiva su "${dest.name}"):`)
    for (const r of comboConflicts) console.log(`  - ${r.sistema} / ${r.pericolo} / ${r.field}`)
  }
  if (contribConflicts.length) {
    console.log(`\nConflitti contributions (stesso user_id+sistema+pericolo+field già presente su "${dest.name}"):`)
    for (const r of srcContrib) {
      const prev = destContribKeys.get(contribKey(r))
      if (prev) console.log(`  - ${r.user_id} / ${r.sistema} / ${r.pericolo} / ${r.field} (status sorgente: ${r.status}, status destinazione attuale: ${prev.status})`)
    }
  }

  if (!WRITE) {
    console.log('\nDry-run: nessuna scrittura effettuata. Rilancia con --write per scrivere su Supabase (upsert).')
    return
  }

  if (!SKIP_CONFIRM) {
    const ok = await confirm(
      `\nStai per fare upsert su "${dest.name}" di ${srcRaci.length} righe raci, ${srcCombo.length} combinazioni_attive, ${srcContrib.length} contributions (status forzato a 'draft'). Confermi? (si/no) `
    )
    if (!ok) {
      console.log('Annullato.')
      return
    }
  }

  if (srcRaci.length) {
    const rows = srcRaci.map((r) => ({ territory_id: dest.id, user_id: r.user_id, sistema: r.sistema, pericolo: r.pericolo, field: r.field, role: r.role }))
    const { error } = await supabase.from('raci').upsert(rows, { onConflict: 'territory_id,user_id,sistema,pericolo,field' })
    if (error) throw error
    console.log(`raci: ${rows.length} righe scritte/sovrascritte su "${dest.name}".`)
  }

  if (srcCombo.length) {
    const rows = srcCombo.map((r) => ({ territory_id: dest.id, sistema: r.sistema, pericolo: r.pericolo, field: r.field }))
    const { error } = await supabase.from('combinazioni_attive').upsert(rows, { onConflict: 'territory_id,sistema,pericolo,field' })
    if (error) throw error
    console.log(`combinazioni_attive: ${rows.length} righe scritte/sovrascritte su "${dest.name}".`)
  }

  if (srcContrib.length) {
    const rows = srcContrib.map((r) => ({
      territory_id: dest.id,
      user_id: r.user_id,
      sistema: r.sistema,
      pericolo: r.pericolo,
      field: r.field,
      factors: r.factors,
      vulnerability: r.vulnerability,
      note: r.note,
      status: 'draft',
    }))
    const { error } = await supabase.from('contributions').upsert(rows, { onConflict: 'territory_id,user_id,sistema,pericolo,field' })
    if (error) throw error
    console.log(`contributions: ${rows.length} righe scritte/sovrascritte su "${dest.name}" (status: draft).`)
  }

  console.log('\nCompletato.')
}

main().catch((err) => {
  console.error('Errore duplicate-territory:', err)
  process.exit(1)
})
