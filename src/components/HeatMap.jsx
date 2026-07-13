import { useMemo, useState } from 'react'
import { useFactorTaxonomy } from '../hooks/useFactors.js'

const ICONS = {
  Siccità: '☀',
  'Incendi boschivi e di interfaccia': '🔥',
  'Alluvioni, piene e frane': '🌊',
  'Ondate di calore e surriscaldamento': '🌡',
}

function maxRischio(items) {
  const r = items.map((x) => x.rischio)
  if (r.includes('Alto')) return 'Alto'
  if (r.includes('Medio')) return 'Medio'
  if (r.includes('Basso')) return 'Basso'
  return ''
}

// Heatmap di rischio (Tab.4, S6): righe/colonne (sistema × pericolo) derivate
// dalla libreria condivisa (/api/factors — le combinazioni realmente presenti
// nel territorio, non hardcoded come nel prototipo docs/SRACC_Visualizzazioni.html).
// Criterio di aggregazione per cella: massimo tra i rischi dei contributi
// (non media ponderata) — il prototipo già lo implementa così; questa scelta
// chiude la questione aperta B1 (§11, Tab.9) per S6.
export default function HeatMap({ contributions }) {
  const { tree, error } = useFactorTaxonomy()
  const [detail, setDetail] = useState(null) // { sistema, pericolo } | null

  const cellData = useMemo(() => {
    const m = new Map()
    for (const c of contributions) {
      // Riga senza fattori (bozza mai iniziata, o scheda resettata) — non un
      // contributo reale, ignorata a prescindere dallo status (v. BowTie.jsx).
      if (!c.factors?.length) continue
      const k = `${c.sistema}|||${c.pericolo}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push({
        field: c.field,
        rischio: c.vulnerability?.rischio || '',
        referente: c.users?.name ?? 'Referente sconosciuto',
      })
    }
    return m
  }, [contributions])

  if (error) return <p>Errore nel caricamento della libreria: {error}</p>
  if (!tree) return <p>Caricamento&hellip;</p>

  const sistemi = Object.keys(tree).sort()
  const pericoli = [...new Set(sistemi.flatMap((s) => Object.keys(tree[s])))].sort()

  return (
    <div className="card">
      <div className="ct">Livello di rischio per sistema × pericolo</div>
      <div className="legend-bar">
        <span>🔴 Alto</span>
        <span>🟡 Medio</span>
        <span>🟢 Basso</span>
        <span>⬜ Non valutato</span>
        <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>Clicca una cella per il dettaglio</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="hm-table">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Sistema</th>
              {pericoli.map((p) => (
                <th key={p} title={p}>
                  {ICONS[p] || '·'}
                  <br />
                  <span style={{ fontSize: 10 }}>{p.split(',')[0]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sistemi.map((sis) => (
              <tr key={sis}>
                <td className="row-hdr">{sis.split(' ')[0]}</td>
                {pericoli.map((per) => {
                  if (!tree[sis][per]) return <td key={per} />
                  const items = cellData.get(`${sis}|||${per}`)
                  if (!items) {
                    return (
                      <td key={per} className="hm-cell c-none">
                        <span className="rl-">—</span>
                      </td>
                    )
                  }
                  const mr = maxRischio(items)
                  return (
                    <td
                      key={per}
                      className={`hm-cell c-${mr}`}
                      onClick={() => setDetail({ sistema: sis, pericolo: per })}
                    >
                      <span className={`rl-${mr}`}>{mr || '—'}</span>
                      <div style={{ marginTop: 4 }}>
                        {[...new Set(items.map((x) => x.field))].map((f) => (
                          <span key={f} className={`fchip ${mr === 'Alto' ? 'a' : mr === 'Medio' ? 'm' : 'b'}`}>
                            {f.split(' ')[0]}&hellip;
                          </span>
                        ))}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`hm-detail${detail ? ' open' : ''}`}>
        {detail && (
          <>
            <div className="det-title">
              {detail.sistema.split(' ')[0]} × {detail.pericolo}
            </div>
            {(cellData.get(`${detail.sistema}|||${detail.pericolo}`) || []).map((x, i) => (
              <div className="frow" key={i}>
                <span className="frn">{x.field}</span>
                <span style={{ fontSize: 11, color: '#666' }}>{x.referente}</span>
                <span className={`rp rp-${x.rischio}`}>{x.rischio || '—'}</span>
              </div>
            ))}
            <button onClick={() => setDetail(null)} style={{ marginTop: 10, fontSize: 12 }}>
              Chiudi
            </button>
          </>
        )}
      </div>
    </div>
  )
}
