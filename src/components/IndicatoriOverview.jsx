import { useMemo } from 'react'
import { useAllIndicatoriScelti } from '../hooks/useIndicatori.js'

const PESO_LABEL = { Determinante: 'Det', Rilevante: 'Rel', Marginale: 'Mar' }

function comboKey(sistema, pericolo, field, user_id) {
  return `${sistema}||${pericolo}||${field}||${user_id}`
}

function groupByField(rows) {
  const m = new Map()
  for (const r of rows) {
    if (!m.has(r.field)) m.set(r.field, [])
    m.get(r.field).push(r)
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function pesoDistribution(indicatori) {
  const counts = { Determinante: 0, Rilevante: 0, Marginale: 0, nonPesato: 0 }
  for (const ind of indicatori) {
    if (ind.peso && counts[ind.peso] !== undefined) counts[ind.peso] += 1
    else counts.nonPesato += 1
  }
  return counts
}

// Tab "Indicatori" di Visualization.jsx (2026-07-16): vista d'insieme sulla
// Fase 2 (S10/S11), stessa impostazione già in uso per le catene d'impatto
// (Bow-tie/Heatmap/Grafo — card-based, nessuna nuova regola di visibilità).
// `contributions` arriva già caricato da Visualization.jsx (stesso pattern
// di BowTie/HeatMap/PervasityGraph, una sola useContributions() per tutte
// le tab invece di una fetch duplicata per tab). Le combinazioni mostrate
// sono quelle con contributo validated visibili al chiamante — stesso
// criterio di availableCombos in IndicatorSelector.jsx, ma senza il filtro
// user_id === profile.id lì aggiunto apposta perché quella vista è "cosa
// posso pesare io"; questa è "vista d'insieme", quindi mostra tutto ciò che
// contributions già contiene (tutto il territorio per coordinator/observer,
// solo i propri per il contributor). indicatori_scelti è recuperato una
// sola volta senza filtri (useAllIndicatoriScelti, stessa visibilità di GET
// /api/indicatori-scelti) e abbinato client-side per
// user_id+sistema+pericolo+field, invece di una chiamata per combinazione.
export default function IndicatoriOverview({ contributions }) {
  const { indicatoriScelti, error: sceltiError } = useAllIndicatoriScelti()

  const rows = useMemo(() => {
    if (!contributions) return []
    const sceltiByKey = new Map()
    for (const s of indicatoriScelti || []) {
      sceltiByKey.set(comboKey(s.sistema, s.pericolo, s.field, s.user_id), s)
    }
    return contributions
      .filter((c) => c.status === 'validated')
      .map((c) => ({
        sistema: c.sistema,
        pericolo: c.pericolo,
        field: c.field,
        user_id: c.user_id,
        referente: c.users?.name ?? 'Referente sconosciuto',
        scelta: sceltiByKey.get(comboKey(c.sistema, c.pericolo, c.field, c.user_id)) ?? null,
      }))
  }, [contributions, indicatoriScelti])

  const showReferente = useMemo(() => new Set(rows.map((r) => r.user_id)).size > 1, [rows])

  if (sceltiError) return <p>Errore nel caricamento degli indicatori scelti: {sceltiError}</p>
  if (indicatoriScelti === undefined) return <p>Caricamento&hellip;</p>

  return (
    <div>
      <div className="card">
        <div className="ct">Vista d'insieme &mdash; Indicatori (Fase 2)</div>
        <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
          Stato della pesatura indicatori per ogni field validato in Fase 1.
        </p>
      </div>

      {rows.length === 0 && <div className="empty">Nessun field validato disponibile al momento.</div>}

      {rows.length > 0 &&
        groupByField(rows).map(([field, items]) => (
          <div className="card" key={field}>
            <div className="ct">{field}</div>
            {items.map((r) => {
              const dist = r.scelta ? pesoDistribution(r.scelta.indicatori || []) : null
              const n = r.scelta?.indicatori?.length ?? 0
              return (
                <div className="ind-row" key={comboKey(r.sistema, r.pericolo, r.field, r.user_id)}>
                  <div className="ind-row-top">
                    <div>
                      <div className="ind-sp">
                        {r.sistema} × {r.pericolo}
                      </div>
                      {showReferente && <div className="ind-ref">{r.referente}</div>}
                    </div>
                    {r.scelta ? (
                      <span className={`status-pill ${r.scelta.status}`}>
                        {r.scelta.status === 'submitted' ? 'Confermato' : 'Bozza salvata'}
                      </span>
                    ) : (
                      <span className="status-pill none">Non iniziato</span>
                    )}
                  </div>
                  {r.scelta && (
                    <div className="ind-row-bottom">
                      <span className="ind-count">{n} indicator{n === 1 ? 'e' : 'i'} selezionat{n === 1 ? 'o' : 'i'}</span>
                      {n > 0 && (
                        <div className="ind-dist">
                          {dist.Determinante > 0 && <span className="ind-peso det">{dist.Determinante} {PESO_LABEL.Determinante}</span>}
                          {dist.Rilevante > 0 && <span className="ind-peso rel">{dist.Rilevante} {PESO_LABEL.Rilevante}</span>}
                          {dist.Marginale > 0 && <span className="ind-peso mar">{dist.Marginale} {PESO_LABEL.Marginale}</span>}
                          {dist.nonPesato > 0 && <span className="ind-peso non">{dist.nonPesato} non pesat{dist.nonPesato === 1 ? 'o' : 'i'}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
    </div>
  )
}
