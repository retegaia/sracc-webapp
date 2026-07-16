// Ordine di visualizzazione fisso della componente di vulnerabilità,
// riusato ovunque un elenco di fattori o indicatori vada mostrato
// raggruppato o ordinato per componente (2026-07-16) — prima ogni punto
// aveva la sua logica (o nessuna, mostrando l'ordine grezzo di
// inserimento/risposta API). 'Pericolo' esiste solo per gli indicatori
// (schema indicatori.componente, non factors.componente) — messo per
// primo per coerenza con l'ordine già usato dalla tendina di libreria in
// IndicatorSelector.jsx (Pericolo/Hazard prima di Esposizione, stesso
// ordine del framework IPCC AR6 alla base di questa app).
export const COMPONENTE_ORDER = ['Pericolo', 'Esposizione', 'Sensibilita', 'Capacita adattiva']

export function compareComponente(a, b) {
  return COMPONENTE_ORDER.indexOf(a) - COMPONENTE_ORDER.indexOf(b)
}

export function sortByComponente(items, getComponente = (x) => x.componente) {
  return [...items].sort((a, b) => compareComponente(getComponente(a), getComponente(b)))
}
