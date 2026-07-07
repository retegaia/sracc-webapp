const PESI = [
  ['Determinante', '3', 'Decisivo per questo pericolo'],
  ['Rilevante', '2', 'Contribuisce al quadro'],
  ['Marginale', '1', 'Influenza limitata'],
]
const PESO_KEY = { Determinante: 'det', Rilevante: 'rel', Marginale: 'mar' }
const PESO_WEIGHT = { Determinante: 3, Rilevante: 2, Marginale: 1 }

// Giudizio preliminare di vulnerabilità — stessa formula del prototipo
// (media dei pesi numerici di Sensibilita/Capacita adattiva → soglie → matrice rischio).
export function computeVuln(selected) {
  const sen = selected.filter((f) => f.componente === 'Sensibilita')
  const cap = selected.filter((f) => f.componente === 'Capacita adattiva')
  const weighted = (items) => items.filter((f) => f.peso)
  if (!weighted(sen).length && !weighted(cap).length) return null

  const score = (items) => {
    const w = weighted(items)
    if (!w.length) return 0
    return w.reduce((a, f) => a + (PESO_WEIGHT[f.peso] || 0), 0) / w.length
  }
  const label = (v) => (v >= 2.5 ? 'Alta' : v >= 1.5 ? 'Media' : 'Bassa')
  const sl = label(score(sen))
  const cl = label(score(cap))
  const matrix = {
    Alta: { Alta: 'Medio', Media: 'Alto', Bassa: 'Alto' },
    Media: { Alta: 'Basso', Media: 'Medio', Bassa: 'Alto' },
    Bassa: { Alta: 'Basso', Media: 'Basso', Bassa: 'Medio' },
  }
  return { sen: sl, cap: cl, rischio: matrix[sl]?.[cl] || '—' }
}

// Passo 3 del form referente (Tab.4): identico al prototipo, peso salvato
// nell'oggetto contribution in stato locale (nessuna chiamata API).
export default function WeightingPanel({ selected, onSelectedChange, onBack, onNext }) {
  const sen = selected.filter((f) => f.componente === 'Sensibilita')
  const cap = selected.filter((f) => f.componente === 'Capacita adattiva')

  function setPeso(nome, peso) {
    onSelectedChange(
      selected.map((f) => (f.nome === nome ? { ...f, peso: f.peso === peso ? null : peso } : f))
    )
  }

  function block(f) {
    return (
      <div className="w-block" key={f.nome}>
        <div className="w-name">{f.nome}</div>
        <div className="w-cards">
          {PESI.map(([p, n, d]) => {
            const sel = f.peso === p
            const k = PESO_KEY[p]
            return (
              <div key={p} className={`wc ${k}${sel ? ` sel-${k}` : ''}`} onClick={() => setPeso(f.nome, p)}>
                <span className="wc-n">{n}</span>
                <span className="wc-l">{p}</span>
                <span className="wc-d">{d}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const v = computeVuln(selected)

  return (
    <>
      <div className="card">
        <div className="ct">Quanto è determinante ogni fattore per questo pericolo nel tuo territorio?</div>
        {sen.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sf)', marginBottom: 8 }}>Sensibilità</div>
            {sen.map(block)}
          </>
        )}
        {cap.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cf)', margin: '12px 0 8px' }}>Capacità adattiva</div>
            {cap.map(block)}
          </>
        )}
      </div>
      {v && (
        <div className="card">
          <div className="ct">Giudizio preliminare</div>
          <div className="vuln-row">
            <div className="vs"><div className="vs-l">Sensibilità</div><div className="vs-v">{v.sen}</div></div>
            <div className="vs"><div className="vs-l">Cap. adattiva</div><div className="vs-v">{v.cap}</div></div>
          </div>
          <div className={`r-badge r-${v.rischio}`}>Rischio preliminare: {v.rischio}</div>
          <p style={{ fontSize: 11, color: '#666', textAlign: 'center' }}>Valore indicativo &mdash; definitivo a Step 5&ndash;6</p>
        </div>
      )}
      <div className="btn-row">
        <button onClick={onBack}>&larr; Indietro</button>
        <button className="btn-primary" onClick={onNext}>Note e riepilogo &rarr;</button>
      </div>
    </>
  )
}
