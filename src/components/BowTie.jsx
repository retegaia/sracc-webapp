import { useEffect, useMemo, useRef, useState } from 'react'
import { sistemaShortLabel } from '../lib/sistemaLabels.js'

const FW_CLASS = { Determinante: 'fw-det', Rilevante: 'fw-rel', Marginale: 'fw-mar' }
const FW_NUM = { Determinante: 3, Rilevante: 2, Marginale: 1 }

function optionLabel(c) {
  return `${c.users?.name ?? 'Referente sconosciuto'} — ${sistemaShortLabel(c.sistema)} × ${c.pericolo.split(',')[0]} × ${c.field}`
}

// Visualizzazione bow-tie (Tab.4, S6): porta 1:1 il layout div/flexbox del
// prototipo docs/SRACC_Visualizzazioni.html — il prototipo non usa <svg> per
// il bow-tie (solo il tab "Grafo", fuori scope, usa <svg>+D3), nonostante la
// dicitura "SVG statico" in Tab.4. Il box "Rischio atteso" del prototipo
// elenca anche gli "impatti attesi": omesso qui, perché lo schema reale di
// contributions non ha un campo corrispondente (solo factors, vulnerability,
// note, status) — deviazione confermata con Andrea Vallebona il 2026-07-10.
export default function BowTie({ contributions, sistema, pericolo, field }) {
  // Righe senza alcun fattore (factors: []) — bozza mai davvero iniziata, o
  // scheda appena resettata (v. ResetButton) — non rappresentano un
  // contributo reale: escluse a prescindere dallo status (una bozza con
  // contenuto vero resta visibile, solo l'assenza totale di fattori la fa
  // ignorare). Stesso criterio applicato in HeatMap, PervasityGraph ed
  // exportData.js.
  const filtered = useMemo(() => {
    const withFactors = contributions.filter((c) => c.factors?.length > 0)
    if (!sistema || !pericolo || !field) return withFactors
    return withFactors.filter((c) => c.sistema === sistema && c.pericolo === pericolo && c.field === field)
  }, [contributions, sistema, pericolo, field])

  const [selectedId, setSelectedId] = useState('')
  const layoutRef = useRef(null)
  const [scrollable, setScrollable] = useState({ left: false, right: false })

  useEffect(() => {
    setSelectedId(filtered.length ? filtered[0].id : '')
  }, [filtered])

  // A 960px .main (v. visualization.css) il bow-tie non eccede più il
  // contenitore alle risoluzioni desktop comuni (1440/1280, verificato con
  // i dati reali di produzione), ma resta un layout a 4 colonne con
  // min-width fissi — su una finestra più stretta, o con contributi che
  // hanno più fattori, può ancora superare lo spazio disponibile. In quel
  // caso .bt-layout scrolla già (overflow-x:auto), ma senza indicazione
  // visiva l'utente non lo scopre (bug segnalato il 2026-07-10): questo
  // effect tiene sincronizzati due flag con lo scroll reale per mostrare
  // un'ombra sul bordo che ha altro contenuto, invece di limitarsi a
  // sperare che l'utente provi a trascinare.
  useEffect(() => {
    const el = layoutRef.current
    if (!el) return
    function update() {
      setScrollable({
        left: el.scrollLeft > 2,
        right: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [selectedId])

  if (!contributions.length) {
    return <div className="empty">Nessun contributo disponibile per questo territorio.</div>
  }
  if (!filtered.length) {
    return <div className="empty">Nessun contributo per questa combinazione.</div>
  }

  const c = filtered.find((x) => x.id === selectedId) || filtered[0]
  const esp = c.factors.filter((f) => f.componente === 'Esposizione')
  const sen = c.factors.filter((f) => f.componente === 'Sensibilita')
  const cap = c.factors.filter((f) => f.componente === 'Capacita adattiva')
  const r = c.vulnerability?.rischio || '—'

  return (
    <>
      {filtered.length > 1 && (
        <div className="card">
          <div className="ct">Seleziona un contributo</div>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {filtered.map((x) => (
              <option key={x.id} value={x.id}>
                {optionLabel(x)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="card">
        <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
          {c.sistema} × {c.pericolo} — {c.field} · <em>{c.users?.name ?? 'Referente sconosciuto'}</em>
        </div>
        <div className={`bt-scroll-wrap${scrollable.left ? ' can-left' : ''}${scrollable.right ? ' can-right' : ''}`}>
          <div className="bt-layout" ref={layoutRef}>
            <div className="bt-col" style={{ minWidth: 110 }}>
              <div className="bt-lbl">Pericolo</div>
              <div className="bt-node bt-per" style={{ flex: 1 }}>
                <div className="bt-title">{c.pericolo}</div>
              </div>
            </div>
            <div className="bt-arr">&rarr;</div>
            <div className="bt-col" style={{ minWidth: 130 }}>
              <div className="bt-lbl">Esposizione</div>
              <div className="bt-node bt-esp" style={{ flex: 1 }}>
                {esp.map((f, i) => (
                  <span className="bt-tags esp" key={i}>
                    {f.nome}
                  </span>
                ))}
                {c.field && (
                  <div style={{ fontSize: 10, color: '#0C447C', marginTop: 6, fontStyle: 'italic' }}>{c.field}</div>
                )}
              </div>
            </div>
            <div className="bt-arr">&rarr;</div>
            <div className="bt-col bt-vul">
              <div className="bt-lbl">Vulnerabilità</div>
              <div className="bt-node bt-sen">
                <div className="vh s">&uarr; Sensibilità</div>
                {sen.map((f, i) => (
                  <div className="fr" key={i}>
                    <span className="dot ds" />
                    <span className="fn">{f.nome}</span>
                    <span className={`fw ${FW_CLASS[f.peso] || 'fw-mar'}`}>{FW_NUM[f.peso] || ''}</span>
                  </div>
                ))}
              </div>
              <div className="bt-node bt-cap" style={{ marginTop: 6 }}>
                <div className="vh c">&darr; Cap. adattiva</div>
                {cap.map((f, i) => (
                  <div className="fr" key={i}>
                    <span className="dot dc" />
                    <span className="fn">{f.nome}</span>
                    <span className={`fw ${FW_CLASS[f.peso] || 'fw-mar'}`}>{FW_NUM[f.peso] || ''}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bt-arr">&rarr;</div>
            <div className="bt-col" style={{ minWidth: 110 }}>
              <div className="bt-lbl">Rischio atteso</div>
              <div className="bt-node bt-ris" style={{ flex: 1 }}>
                <div className={`r-big r-${r}`}>{r}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="leg">
        <div className="li">
          <span className="ld" style={{ background: '#E24B4A' }} />
          Sensibilità — amplifica
        </div>
        <div className="li">
          <span className="ld" style={{ background: '#639922' }} />
          Cap. adattiva — riduce
        </div>
        <div className="li">Det·3 &nbsp; Rel·2 &nbsp; Mar·1</div>
      </div>
    </>
  )
}
