import { useMemo, useState } from 'react'

const LABELS = { Esposizione: 'Esposizione', Sensibilita: 'Sensibilità', 'Capacita adattiva': 'Capacità adattiva' }
const CSS_KEY = { Esposizione: 'esp', Sensibilita: 'sen', 'Capacita adattiva': 'cap' }
const PESO_KEY = { Determinante: 'det', Rilevante: 'rel', Marginale: 'mar' }
const ICONS = {
  Siccità: '☀',
  'Incendi boschivi e di interfaccia': '🔥',
  'Alluvioni, piene e frane': '🌊',
  'Ondate di calore e surriscaldamento': '🌡',
}

function maxRischio(conts) {
  const r = conts.map((c) => c.vulnerability?.rischio).filter(Boolean)
  if (r.includes('Alto')) return 'Alto'
  if (r.includes('Medio')) return 'Medio'
  if (r.includes('Basso')) return 'Basso'
  return ''
}

function groupByTavola(contributions) {
  const tavole = new Map()
  for (const c of contributions) {
    const k = `${c.sistema}||${c.pericolo}`
    if (!tavole.has(k)) tavole.set(k, { sistema: c.sistema, pericolo: c.pericolo, fields: new Map() })
    const t = tavole.get(k)
    if (!t.fields.has(c.field)) t.fields.set(c.field, [])
    t.fields.get(c.field).push(c)
  }
  return [...tavole.values()]
}

// Vista coordinatore — tab 1 (Tab.4): dati da GET /api/contributions,
// espansione field via accordion — identico al prototipo
// (docs/SRACC_Vista_Coordinatore.html), a parte le chiavi di componente
// senza accento (Sensibilita/Capacita adattiva) imposte dal CHECK di schema.
export default function AggregatedView({ contributions }) {
  const [open, setOpen] = useState(() => new Set())
  const tavole = useMemo(() => groupByTavola(contributions), [contributions])

  if (!contributions.length) {
    return <div className="empty">Nessun contributo disponibile per questo territorio.</div>
  }

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      {tavole.map((t) => (
        <div key={`${t.sistema}||${t.pericolo}`}>
          <div className="tavola-title">
            {ICONS[t.pericolo] || '·'} {t.sistema} × {t.pericolo}
          </div>
          {[...t.fields.entries()].map(([field, conts]) => {
            const id = `${t.sistema}||${t.pericolo}||${field}`
            const mr = maxRischio(conts)
            const isOpen = open.has(id)
            return (
              <div className="fblock" key={id}>
                <div className="fhdr" onClick={() => toggle(id)}>
                  <span className="fn">{field}</span>
                  <span className={`rbadge rb-${mr}`}>{mr || '—'}</span>
                  <span style={{ color: '#999', marginLeft: 6 }}>{conts.length} contrib.</span>
                  <span style={{ color: '#999', marginLeft: 6, fontSize: 18 }}>{isOpen ? '⌄' : '›'}</span>
                </div>
                {isOpen && (
                  <div className="fbody open">
                    {conts.map((c, i) => (
                      <div className="rblock" key={c.id} style={i > 0 ? { borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: -1 } : undefined}>
                        <div className="rname">
                          👤 {c.users?.name ?? 'Referente sconosciuto'} — {c.users?.discipline ?? '—'}
                          {c.vulnerability && (
                            <span className={`rbadge rb-${c.vulnerability.rischio}`} style={{ marginLeft: 6 }}>
                              {c.vulnerability.rischio}
                            </span>
                          )}
                        </div>
                        {c.factors.map((f, fi) => (
                          <div className="fr" key={fi}>
                            <span className={`cpill c-${CSS_KEY[f.componente] || 'esp'}`}>{LABELS[f.componente] || f.componente}</span>
                            <span className="fnm">{f.nome}</span>
                            {f.peso && <span className={`fp fp-${PESO_KEY[f.peso] || 'mar'}`}>{f.peso}</span>}
                          </div>
                        ))}
                        {c.note && <div className="note-box">📝 {c.note}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
