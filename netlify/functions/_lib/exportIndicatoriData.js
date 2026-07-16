// Aggregazione per l'export degli indicatori (Fase 2, S10/S11) — stesso
// principio di exportData.js (combos -> gruppi -> Word/Excel), ma i dati di
// partenza sono `indicatori_scelti` invece di `contributions`: ogni riga
// scelta contiene già un array di indicatori (indicatore_id, nome,
// componente, peso), quindi qui il "record" esportato è il singolo
// indicatore, non una combinazione aggregata sistema×pericolo×field.
export const NON_PESATO = 'Non pesato'
const STATUS_LABEL = { draft: 'Bozza', submitted: 'Confermato' }

// indicatori_scelti.indicatori non porta tipologia/categoria (v.
// supabase/schema.sql) — vanno recuperati dalla libreria `indicatori` per
// indicatore_id. `library` è l'unione condivisa+territoriale così com'è
// restituita da GET /api/indicatori (netlify/functions/indicatori.js).
export function buildIndicatoriRows(indicatoriScelti, library) {
  const libById = new Map(library.map((i) => [i.id, i]))
  const rows = []
  for (const scelta of indicatoriScelti) {
    for (const ind of scelta.indicatori || []) {
      const lib = libById.get(ind.indicatore_id)
      rows.push({
        sistema: scelta.sistema,
        pericolo: scelta.pericolo,
        field: scelta.field,
        indicatore: ind.nome,
        tipologia: lib?.tipologia || null,
        categoria: lib?.categoria || null,
        peso: ind.peso || null,
        status: STATUS_LABEL[scelta.status] || scelta.status,
      })
    }
  }
  return rows
}

// Stesso schema di gruppo di buildGroups in exportData.js
// ({title, sistema, distinguisher, rowLabel, items}), riusato tal quale dai
// generatori Word/Excel — qui ogni riga di un gruppo è un indicatore, non
// un field aggregato, quindi rowLabel identifica la colonna che varia
// dentro il gruppo (pericolo o field, a seconda del raggruppamento) mentre
// il resto delle colonne (indicatore, tipologia, categoria, peso, stato)
// resta fisso.
export function buildIndicatoriGroups(rows, groupBy) {
  const groups = new Map()
  for (const r of rows) {
    const gkey = groupBy === 'field' ? `${r.sistema}|||${r.field}` : `${r.sistema}|||${r.pericolo}`
    const distinguisher = groupBy === 'field' ? r.field : r.pericolo
    const title = `${r.sistema} — ${distinguisher}`
    const rowLabel = groupBy === 'field' ? 'Pericolo' : 'Impact Field'
    const rowValue = groupBy === 'field' ? r.pericolo : r.field
    if (!groups.has(gkey)) groups.set(gkey, { title, sistema: r.sistema, distinguisher, rowLabel, items: [] })
    groups.get(gkey).items.push({ rowValue, ...r })
  }
  return [...groups.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => a.rowValue.localeCompare(b.rowValue) || a.indicatore.localeCompare(b.indicatore)),
    }))
}
