import { useMemo } from 'react'

const PW = { Determinante: 3, Rilevante: 2, Marginale: 1 }

function pesoLabel(v) {
  if (v >= 2.5) return 'Determinante'
  if (v >= 1.5) return 'Rilevante'
  return 'Marginale'
}

function computeFrequenze(contributions) {
  const freq = new Map()
  for (const c of contributions) {
    for (const f of c.factors) {
      if (!freq.has(f.nome)) freq.set(f.nome, { count: 0, fields: new Set(), refs: new Set(), pesi: [] })
      const d = freq.get(f.nome)
      d.count++
      d.fields.add(c.field)
      d.refs.add(c.users?.name ?? c.user_id)
      if (f.peso) d.pesi.push(PW[f.peso] || 0)
    }
  }
  return [...freq.entries()].sort((a, b) => b[1].count - a[1].count)
}

function Gruppo({ items, label, color }) {
  if (!items.length) return null
  return (
    <div className="card">
      <div className="ct" style={{ color }}>{label} ({items.length})</div>
      {items.map(([nome, d]) => {
        const avg = d.pesi.length ? d.pesi.reduce((a, b) => a + b, 0) / d.pesi.length : 0
        return (
          <div className="perv-row" key={nome}>
            <span className="pn">{nome}</span>
            <div className="pb">
              {[...d.fields].map((_, i) => (
                <span className="pdot" style={{ background: 'var(--gm)' }} key={i} />
              ))}
            </div>
            <span className="pc">{d.fields.size}f · {d.count}cit</span>
            <span style={{ fontSize: 11, color: '#666', minWidth: 80, textAlign: 'right' }}>
              {d.pesi.length ? pesoLabel(avg) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Vista coordinatore — tab 2 (Tab.4): calcolo pervasività lato client sui
// dati da GET /api/contributions — identico al prototipo
// (docs/SRACC_Vista_Coordinatore.html). Un fattore è "pervasivo" quando
// ricorre in almeno 2 impact field diversi o è citato almeno 3 volte.
export default function PervasivityView({ contributions }) {
  const sorted = useMemo(() => computeFrequenze(contributions), [contributions])

  if (!contributions.length) {
    return <div className="empty">Nessun contributo disponibile per questo territorio.</div>
  }

  const alta = sorted.filter(([, d]) => d.fields.size >= 2 || d.count >= 3)
  const media = sorted.filter(([, d]) => d.count === 2 && d.fields.size < 2)
  const singola = sorted.filter(([, d]) => d.count === 1)

  return (
    <>
      <Gruppo items={alta} label="Pervasività alta" color="#A32D2D" />
      <Gruppo items={media} label="Pervasività media" color="#854F0B" />
      {singola.length > 0 && (
        <div className="card">
          <div className="ct">Singola occorrenza ({singola.length})</div>
          {singola.map(([nome]) => (
            <div className="perv-row" key={nome}>
              <span className="pn">{nome}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
