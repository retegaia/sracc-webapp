// Aggregazione condivisa per il modulo di export delle catene d'impatto
// (2026-07-10), usata da export.js per generare sia Word che Excel a
// partire dagli stessi dati.
export const PLACEHOLDER = 'Nessun contributo'
export const NO_IMPATTI = 'Nessun impatto atteso in libreria per questa combinazione'
export const LIBRARY_ONLY = 'Previsione di libreria — nessun contributo compilato'

// Criterio "massimo tra i rischi dei contributi", stesso di HeatMap.jsx
// (S6, chiude B1) — duplicato qui invece di importato perché uno gira nel
// browser e l'altro in una Netlify Function; nessuna build condivisa tra i
// due bundle in questo repo.
function maxRischio(rischi) {
  if (rischi.includes('Alto')) return 'Alto'
  if (rischi.includes('Medio')) return 'Medio'
  if (rischi.includes('Basso')) return 'Basso'
  return ''
}

// Combina contributions + impatti_attesi in una mappa per combinazione
// sistema×pericolo×field. Le righe di impatti_attesi determinano l'insieme
// "ufficiale" delle combinazioni (le 39 del documento originale); eventuali
// contributi su una combinazione assente dalla libreria vengono comunque
// inclusi (unione, non intersezione) per non far sparire silenziosamente
// lavoro reale di un referente.
export function buildCombos(contributions, impattiAttesi) {
  const combos = new Map()

  function ensure(sistema, pericolo, field) {
    const key = `${sistema}|||${pericolo}|||${field}`
    if (!combos.has(key)) {
      combos.set(key, {
        sistema,
        pericolo,
        field,
        esposizione: new Set(),
        sensibilita: new Map(), // nome -> Set(peso)
        capacitaAdattiva: new Map(),
        rischi: [],
        impatti: [],
        contributionCount: 0,
      })
    }
    return combos.get(key)
  }

  for (const row of impattiAttesi) {
    const c = ensure(row.sistema, row.pericolo, row.field)
    c.impatti.push({ impatto: row.impatto, ordine: row.ordine ?? 0 })
  }

  for (const contrib of contributions) {
    // Riga senza fattori (bozza mai iniziata, o scheda resettata, v.
    // contributions-reset.js) — ignorata: non deve contare come
    // hasContribution, altrimenti il render sopprime lo stile
    // LIBRARY_ONLY e mostra la riga come "compilata ma vuota" invece che
    // come previsione di sola libreria (stesso criterio di BowTie.jsx).
    if (!contrib.factors?.length) continue
    const c = ensure(contrib.sistema, contrib.pericolo, contrib.field)
    c.contributionCount += 1
    for (const f of contrib.factors || []) {
      if (f.componente === 'Esposizione') {
        c.esposizione.add(f.nome)
      } else if (f.componente === 'Sensibilita') {
        if (!c.sensibilita.has(f.nome)) c.sensibilita.set(f.nome, new Set())
        // f.peso ?? null, non "if (f.peso)": un fattore con peso null va
        // mostrato comunque (v. weightedLines), non scartato in silenzio —
        // bug trovato in verifica l'11/07, cruciale per le 39 combinazioni
        // migrate dalle catene d'impatto, che hanno fattori reali ma
        // nessuna pesatura per design della migrazione.
        c.sensibilita.get(f.nome).add(f.peso ?? null)
      } else if (f.componente === 'Capacita adattiva') {
        if (!c.capacitaAdattiva.has(f.nome)) c.capacitaAdattiva.set(f.nome, new Set())
        c.capacitaAdattiva.get(f.nome).add(f.peso ?? null)
      }
    }
    if (contrib.vulnerability?.rischio) c.rischi.push(contrib.vulnerability.rischio)
  }

  return combos
}

// Righe grezze (peso, nome) -> etichette leggibili "nome (peso)", una per
// combinazione nome+peso distinta anche se più referenti hanno assegnato
// pesi diversi allo stesso fattore — nessuna riconciliazione automatica,
// mostra entrambe. peso === null (fattore presente ma non ancora pesato,
// v. buildCombos) diventa "nome (non pesato)" — deve restare distinguibile
// da PLACEHOLDER ("Nessun contributo"), che si applica solo quando map è
// vuota, cioè quando non esiste alcun fattore in quella componente.
function weightedLines(map) {
  if (!map.size) return null
  const lines = []
  for (const [nome, pesi] of map) {
    if (!pesi.size) continue
    for (const peso of [...pesi].sort()) lines.push(peso ? `${nome} (${peso})` : `${nome} (non pesato)`)
  }
  return lines.length ? lines.sort() : null
}

// Vista "formattata" di una combinazione: array o null (assenza di dati,
// da rendere con un placeholder testuale a scelta del chiamante — v. Word
// ed Excel builder — decisione confermata con Andrea Vallebona il
// 2026-07-10, "Placeholder testuale" invece di celle vuote o riga omessa).
// hasContribution distingue gli impatti attesi "di libreria" (nessun
// referente ha ancora lavorato quella combinazione) da quelli associati a
// un contributo reale — senza questo flag la colonna Impatti atteso
// mostrava testo pieno anche quando tutte le altre colonne erano
// "Nessun contributo", un'incoerenza segnalata da Andrea Vallebona il
// 2026-07-10 dopo la prima verifica in produzione.
function formatCombo(c) {
  const rischioLivello = maxRischio(c.rischi) || null
  return {
    esposizione: c.esposizione.size ? [...c.esposizione].sort() : null,
    sensibilita: weightedLines(c.sensibilita),
    capacitaAdattiva: weightedLines(c.capacitaAdattiva),
    rischioLivello,
    impatti: c.impatti.length ? [...c.impatti].sort((a, b) => a.ordine - b.ordine).map((i) => i.impatto) : null,
    hasContribution: c.contributionCount > 0,
  }
}

// groupBy 'sistema-pericolo' (default, come le tavole del documento
// originale): una tavola per sistema×pericolo, righe = impact field.
// groupBy 'field': una tavola per sistema×field, righe = pericolo — utile
// per leggere in verticale come lo stesso field si comporta sui diversi
// pericoli a cui è esposto.
export function buildGroups(combos, groupBy) {
  const groups = new Map()
  for (const c of combos.values()) {
    const view = formatCombo(c)
    const gkey = groupBy === 'field' ? `${c.sistema}|||${c.field}` : `${c.sistema}|||${c.pericolo}`
    const distinguisher = groupBy === 'field' ? c.field : c.pericolo
    const title = `${c.sistema} — ${distinguisher}`
    const rowLabel = groupBy === 'field' ? 'Pericolo' : 'Impact Field'
    const rowValue = groupBy === 'field' ? c.pericolo : c.field
    // sistema/distinguisher esposti separati dal title già assemblato: il
    // titolo Word (senza limiti di lunghezza) usa title per intero, mentre
    // il nome foglio Excel (max 31 caratteri) deve troncare sistema — che
    // si ripete identico su più tavole dello stesso sistema — non
    // distinguisher, altrimenti tavole diverse dello stesso sistema
    // collassano su nomi foglio indistinguibili (bug trovato il
    // 2026-07-10 in verifica: "Insediativo e delle Infrastrutt",
    // "Insediativo e delle Infrast (2)/(3)" senza alcun modo di sapere
    // quale pericolo fosse quale).
    if (!groups.has(gkey)) groups.set(gkey, { title, sistema: c.sistema, distinguisher, rowLabel, items: [] })
    groups.get(gkey).items.push({ rowLabel: rowValue, view })
  }
  return [...groups.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.rowLabel.localeCompare(b.rowLabel)) }))
}
