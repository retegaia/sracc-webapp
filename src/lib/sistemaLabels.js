// Etichetta breve dei tre sistemi, usata ovunque lo spazio in UI non basta
// per il nome completo (bottoni filtro, intestazioni tabella, dropdown).
// Mappa esplicita invece di un'euristica sulla stringa (es. "prima
// parola") — quell'approccio (duplicato in PervasityGraph.jsx,
// HeatMap.jsx, BowTie.jsx) funzionava per caso su due sistemi su tre e
// produceva "Sistema" per "Sistema degli Ambienti Naturali", il cui nome
// inizia proprio con la parola generica che l'euristica isolava (bug
// trovato da Andrea il 2026-07-13). Unico punto da aggiornare se in
// futuro cambiano i nomi sistema — nessun altro file deve derivare
// l'etichetta breve per conto proprio.
export const SISTEMA_SHORT_LABEL = {
  'Agricoltura e Allevamento': 'Agricoltura',
  'Insediativo e delle Infrastrutture': 'Insediativo',
  'Sistema degli Ambienti Naturali': 'Ambienti Naturali',
}

export function sistemaShortLabel(sistema) {
  return SISTEMA_SHORT_LABEL[sistema] ?? sistema
}
