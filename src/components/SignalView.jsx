import { useEffect, useMemo, useState } from 'react'
import { apiPost } from '../lib/apiClient.js'
import { compareComponente } from '../lib/componenteOrder.js'

const LABELS = { Esposizione: 'Esposizione', Sensibilita: 'Sensibilità', 'Capacita adattiva': 'Capacità adattiva' }
const CSS_KEY = { Esposizione: 'esp', Sensibilita: 'sen', 'Capacita adattiva': 'cap' }
const MAX_FATTORI = 30

// Cache dei risultati di /api/ai/overlaps per combinazione sistema×pericolo.
// Vive a livello di modulo (non nello state di React) così sopravvive allo
// smontaggio di SignalView quando il coordinatore cambia tab in
// CoordinatorView, e si azzera naturalmente al reload della pagina — è
// esattamente il "cachato per sessione" richiesto dal §6.2.
const overlapCache = new Map()

function groupByTavola(contributions) {
  const tavole = new Map()
  for (const c of contributions) {
    const k = `${c.sistema}||${c.pericolo}`
    if (!tavole.has(k)) tavole.set(k, { key: k, sistema: c.sistema, pericolo: c.pericolo, contributions: [] })
    tavole.get(k).contributions.push(c)
  }
  return [...tavole.values()]
}

// Divergenza di rischio: stesso field, contributi di referenti diversi con
// vulnerability.rischio non concordi.
function rischioDivergenze(contributions) {
  const byField = new Map()
  for (const c of contributions) {
    if (!c.vulnerability?.rischio) continue
    if (!byField.has(c.field)) byField.set(c.field, [])
    byField.get(c.field).push({ rischio: c.vulnerability.rischio, referente: c.users?.name ?? 'Referente sconosciuto' })
  }
  const out = []
  for (const [field, valutazioni] of byField) {
    if (new Set(valutazioni.map((v) => v.rischio)).size > 1) out.push({ field, valutazioni })
  }
  return out
}

// Divergenza di classificazione: stesso nome di fattore (case-insensitive),
// classificato in componenti diverse da referenti diversi.
function componenteDivergenze(contributions) {
  const byNome = new Map()
  for (const c of contributions) {
    for (const f of c.factors) {
      const key = f.nome.trim().toLowerCase()
      if (!key) continue
      if (!byNome.has(key)) byNome.set(key, { nome: f.nome, componenti: new Set() })
      byNome.get(key).componenti.add(f.componente)
    }
  }
  return [...byNome.values()].filter((v) => v.componenti.size > 1)
}

function uniqueFattori(contributions) {
  const seen = new Set()
  const out = []
  for (const c of contributions) {
    for (const f of c.factors) {
      const nome = f.nome.trim()
      if (nome && !seen.has(nome)) {
        seen.add(nome)
        out.push(nome)
      }
    }
  }
  return out.slice(0, MAX_FATTORI)
}

function Tavola({ t }) {
  const [state, setState] = useState(() => {
    return overlapCache.has(t.key) ? { status: 'loading' } : { status: 'idle' }
  })

  // Lazy: parte solo al montaggio di questo componente, cioè solo quando il
  // coordinatore apre il tab Segnalazioni (CoordinatorView smonta i tab non
  // attivi) — mai al caricamento della pagina. La cache tiene la Promise
  // stessa (non solo il risultato), così due mount ravvicinati per la
  // stessa tavola (es. React StrictMode in sviluppo) condividono un'unica
  // richiesta invece di duplicarla.
  useEffect(() => {
    const fattori = uniqueFattori(t.contributions)
    if (fattori.length < 2) {
      setState({ status: 'done', sovrapposizioni: [] })
      return
    }
    if (!overlapCache.has(t.key)) {
      overlapCache.set(
        t.key,
        apiPost('ai/overlaps', { sistema: t.sistema, pericolo: t.pericolo, fattori }).then((r) => r.sovrapposizioni)
      )
    }
    let active = true
    setState({ status: 'loading' })
    overlapCache
      .get(t.key)
      .then((sovrapposizioni) => {
        if (active) setState({ status: 'done', sovrapposizioni })
      })
      .catch((err) => {
        overlapCache.delete(t.key)
        if (active) setState({ status: 'error', error: err.message })
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.key])

  const rDiv = useMemo(() => rischioDivergenze(t.contributions), [t.contributions])
  const cDiv = useMemo(() => componenteDivergenze(t.contributions), [t.contributions])
  const noSignals = rDiv.length === 0 && cDiv.length === 0 && state.status === 'done' && state.sovrapposizioni.length === 0

  return (
    <div className="card">
      <div className="ct">{t.sistema} &times; {t.pericolo}</div>

      {noSignals && <div className="empty" style={{ padding: 12 }}>Nessuna segnalazione per questa combinazione.</div>}

      {rDiv.length > 0 && (
        <div className="signal-group">
          <div className="signal-hdr">Divergenza di valutazione del rischio</div>
          {rDiv.map((d) => (
            <div className="signal-row" key={d.field}>
              <span className="sg-field">{d.field}</span>
              <span className="sg-detail">
                {d.valutazioni.map((v, i) => (
                  <span key={i} className={`rbadge rb-${v.rischio}`} style={{ marginLeft: i ? 4 : 0 }} title={v.referente}>
                    {v.rischio}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {cDiv.length > 0 && (
        <div className="signal-group">
          <div className="signal-hdr">Divergenza di classificazione</div>
          {cDiv.map((d) => (
            <div className="signal-row" key={d.nome}>
              <span className="sg-field">{d.nome}</span>
              <span className="sg-detail">
                {[...d.componenti].sort(compareComponente).map((comp) => (
                  <span key={comp} className={`cpill c-${CSS_KEY[comp] || 'esp'}`} style={{ marginLeft: 4 }}>
                    {LABELS[comp] || comp}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="signal-group">
        <div className="signal-hdr">Sovrapposizioni semantiche (AI)</div>
        {state.status === 'loading' && <div className="note-info">Analisi in corso&hellip;</div>}
        {state.status === 'error' && <div className="note-info">Sovrapposizioni non disponibili: {state.error}</div>}
        {state.status === 'done' && state.sovrapposizioni.length === 0 && (
          <div className="note-info">Nessuna sovrapposizione rilevata.</div>
        )}
        {state.status === 'done' &&
          state.sovrapposizioni.map((s, i) => (
            <div className="signal-row" key={i}>
              <span className="sg-detail">{s}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

// Vista coordinatore — tab 3 (Tab.4, S5). Due tipi di segnalazione:
// - divergenze, calcolate client-side sui dati già caricati da
//   GET /api/contributions (nessuna chiamata aggiuntiva);
// - sovrapposizioni semantiche da /api/ai/overlaps, una chiamata per
//   combinazione sistema×pericolo, lazy (solo all'apertura di questo tab,
//   mai al caricamento della pagina) e cachata per sessione (§6.2).
export default function SignalView({ contributions }) {
  const tavole = useMemo(() => groupByTavola(contributions), [contributions])

  if (!contributions.length) {
    return <div className="empty">Nessun contributo disponibile per questo territorio.</div>
  }

  return (
    <>
      {tavole.map((t) => (
        <Tavola key={t.key} t={t} />
      ))}
    </>
  )
}
