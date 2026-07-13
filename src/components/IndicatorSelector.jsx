import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useContributions } from '../hooks/useContributions.js'
import { useFieldIndicatori, useIndicatoriScelti } from '../hooks/useIndicatori.js'
import { apiPost } from '../lib/apiClient.js'
import ResetButton from './ResetButton.jsx'
import '../styles/indicatorSelector.css'

const COMPONENTI = ['Pericolo', 'Esposizione', 'Sensibilita', 'Capacita adattiva']
const LABELS = { Pericolo: 'Pericolo', Esposizione: 'Esposizione', Sensibilita: 'Sensibilità', 'Capacita adattiva': 'Capacità adattiva' }
const CSS_KEY = { Pericolo: 'per', Esposizione: 'esp', Sensibilita: 'sen', 'Capacita adattiva': 'cap' }
const PESI = [
  ['Determinante', '3'],
  ['Rilevante', '2'],
  ['Marginale', '1'],
]
const PESO_KEY = { Determinante: 'det', Rilevante: 'rel', Marginale: 'mar' }

function comboKey(c) {
  return `${c.sistema}||${c.pericolo}||${c.field}`
}

function groupByField(combos) {
  const m = new Map()
  for (const c of combos) {
    if (!m.has(c.field)) m.set(c.field, [])
    m.get(c.field).push(c)
  }
  return [...m.entries()]
}

function groupBySistemaPericolo(combos) {
  const m = new Map()
  for (const c of combos) {
    const k = `${c.sistema}||${c.pericolo}`
    if (!m.has(k)) m.set(k, { sistema: c.sistema, pericolo: c.pericolo, items: [] })
    m.get(k).items.push(c)
  }
  return [...m.values()]
}

// Route /indicatori (S11, §10.3-10.4): il referente (o il coordinator, sui
// propri field) sceglie e pesa gli indicatori sui field la cui Fase 1 è
// stata validata dal coordinatore (S10). Non un componente riusato da
// FactorChips/WeightingPanel — v. commento in testa a indicatorSelector.css
// per il perché.
export default function IndicatorSelector() {
  const { profile } = useAuth()
  const { contributions, error: contribError } = useContributions()
  const [groupBy, setGroupBy] = useState('field')
  const [active, setActive] = useState(null) // {sistema, pericolo, field} | null
  const [selected, setSelected] = useState([]) // [{indicatore_id, nome, componente, peso}]
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState('')

  const { indicatori: library, error: libError } = useFieldIndicatori(active?.sistema, active?.pericolo, active?.field)
  const { indicatoriScelti, error: sceltiError, refetch: refetchScelti } = useIndicatoriScelti(active?.sistema, active?.pericolo)

  // Nota (istruzione esplicita): anche il coordinator scrive su
  // indicatori-scelti solo se assegnato via RACI (stesso controllo di
  // isAssigned in contributions.js) — quindi "disponibile per la Fase 2"
  // per l'utente corrente significa "propri contributi validated", non
  // l'intero territorio che GET /api/contributions restituisce al
  // coordinator.
  const availableCombos = useMemo(() => {
    if (!contributions || !profile) return []
    return contributions
      .filter((c) => c.user_id === profile.id && c.status === 'validated')
      .map((c) => ({ sistema: c.sistema, pericolo: c.pericolo, field: c.field }))
  }, [contributions, profile])

  // indicatori-scelti per sistema×pericolo può contenere righe di altri
  // referenti quando il chiamante è coordinator (GET non filtra per
  // user_id lato server in quel caso) — isoliamo la riga di QUESTO utente.
  const ownExisting = useMemo(() => {
    if (!indicatoriScelti || !active || !profile) return undefined
    return indicatoriScelti.find((r) => r.user_id === profile.id && r.field === active.field)
  }, [indicatoriScelti, active, profile])

  // Nessuna riga propria salvata per la combinazione: precompila dalla
  // libreria disciplinare (già scelta a monte in S10) invece di partire
  // vuoti — il referente parte da "tutto selezionato, da pesare" e toglie
  // solo ciò che non ritiene pertinente. Aspetta che entrambe le fetch
  // siano risolte per non sovrascrivere una riga salvata con il default
  // mentre indicatoriScelti sta ancora caricando.
  useEffect(() => {
    if (!active || indicatoriScelti === undefined) return
    if (ownExisting) {
      setSelected(ownExisting.indicatori)
      return
    }
    if (library === undefined) return
    setSelected(library.map((ind) => ({ indicatore_id: ind.id, nome: ind.nome, componente: ind.componente, peso: null })))
  }, [active, indicatoriScelti, ownExisting, library])

  function openCombo(combo) {
    setActive(combo)
    setSelected([])
    setSaveStatus('idle')
    setErrorMsg('')
  }

  function toggleIndicator(ind) {
    setSelected((prev) => {
      const idx = prev.findIndex((x) => x.indicatore_id === ind.id)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      return [...prev, { indicatore_id: ind.id, nome: ind.nome, componente: ind.componente, peso: null }]
    })
  }

  function setPeso(indicatore_id, peso) {
    setSelected((prev) =>
      prev.map((x) => (x.indicatore_id === indicatore_id ? { ...x, peso: x.peso === peso ? null : peso } : x))
    )
  }

  async function save(status) {
    setSaveStatus('saving')
    setErrorMsg('')
    try {
      await apiPost('indicatori-scelti', {
        sistema: active.sistema,
        pericolo: active.pericolo,
        field: active.field,
        indicatori: selected,
        status,
      })
      setSaveStatus('saved')
    } catch (err) {
      setSaveStatus('error')
      setErrorMsg(err.message)
    }
  }

  if (active) {
    return (
      <div className="indicator-selector">
        <div className="card">
          <div className="ct" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>{active.field}</span>
            {ownExisting && (
              <ResetButton
                kind="indicatori-scelti"
                sistema={active.sistema}
                pericolo={active.pericolo}
                field={active.field}
                user_id={profile.id}
                label="Resetta questa selezione"
                onReset={() => {
                  setSelected([])
                  refetchScelti()
                }}
              />
            )}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: ownExisting ? 8 : 0 }}>
            {active.sistema} × {active.pericolo}
          </div>
          {ownExisting && (
            <span className={`status-pill ${ownExisting.status}`}>
              {ownExisting.status === 'submitted' ? 'Confermato' : 'Bozza salvata'}
            </span>
          )}
        </div>

        {libError && <p>Errore nel caricamento degli indicatori: {libError}</p>}
        {sceltiError && <p>Errore nel caricamento delle selezioni: {sceltiError}</p>}

        {!libError && library === undefined && <p>Caricamento indicatori&hellip;</p>}
        {!libError && library !== undefined && (
          <div className="card">
            <div className="ct">Indicatori disponibili</div>
            {library.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>Nessun indicatore di libreria per questa combinazione.</p>}
            {COMPONENTI.map((comp) => {
              const items = library.filter((i) => i.componente === comp)
              if (!items.length) return null
              return (
                <div key={comp}>
                  <div className={`comp-hdr ${CSS_KEY[comp]}`}>{LABELS[comp]}</div>
                  <div className="chips">
                    {items.map((ind) => {
                      const isSel = selected.some((x) => x.indicatore_id === ind.id)
                      return (
                        <span
                          key={ind.id}
                          className={`chip${isSel ? ` sel-${CSS_KEY[comp]}` : ''}`}
                          onClick={() => toggleIndicator(ind)}
                        >
                          {ind.nome}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {selected.length > 0 && (
          <div className="card">
            <div className="ct">Quanto è determinante ogni indicatore selezionato?</div>
            {selected.map((s) => (
              <div className="w-block" key={s.indicatore_id}>
                <div className="w-name">
                  [{LABELS[s.componente] || s.componente}] {s.nome}
                </div>
                <div className="w-cards">
                  {PESI.map(([p, n]) => {
                    const sel = s.peso === p
                    const k = PESO_KEY[p]
                    return (
                      <div
                        key={p}
                        className={`wc ${k}${sel ? ` sel-${k}` : ''}`}
                        onClick={() => setPeso(s.indicatore_id, p)}
                      >
                        <span className="wc-n">{n}</span>
                        <span className="wc-l">{p}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {saveStatus === 'saved' && <p style={{ color: 'var(--cf)' }}>Salvato.</p>}
        {saveStatus === 'error' && <p style={{ color: 'var(--sf)' }}>Errore: {errorMsg}</p>}

        <div className="btn-row">
          <button onClick={() => setActive(null)}>&larr; Torna alla lista</button>
          <button onClick={() => save('draft')} disabled={saveStatus === 'saving'}>
            Salva bozza
          </button>
          <button className="btn-primary" onClick={() => save('submitted')} disabled={saveStatus === 'saving'}>
            Conferma
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="indicator-selector">
      <div className="card">
        <div className="ct">Pesatura indicatori &mdash; Fase 2</div>
        <div className="note-info">Seleziona un field validato per scegliere e pesare gli indicatori (§10).</div>
      </div>

      {contribError && <p>Errore nel caricamento dei contributi: {contribError}</p>}
      {!contribError && contributions === undefined && <p>Caricamento&hellip;</p>}
      {!contribError && contributions !== undefined && availableCombos.length === 0 && (
        <div className="empty">Nessun field validato disponibile al momento.</div>
      )}
      {!contribError && availableCombos.length > 0 && (
        <>
          <div className="group-toggle">
            <button className={`gt-btn${groupBy === 'field' ? ' on' : ''}`} onClick={() => setGroupBy('field')}>
              Per field
            </button>
            <button
              className={`gt-btn${groupBy === 'sistema-pericolo' ? ' on' : ''}`}
              onClick={() => setGroupBy('sistema-pericolo')}
            >
              Per sistema&times;pericolo
            </button>
          </div>

          {groupBy === 'field'
            ? groupByField(availableCombos).map(([field, combos]) => (
                <div key={field}>
                  <div className="group-title">{field}</div>
                  {combos.map((c) => (
                    <div className="combo-row" key={comboKey(c)} onClick={() => openCombo(c)}>
                      <div>
                        <div className="cn">{c.sistema}</div>
                        <div className="cs">{c.pericolo}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            : groupBySistemaPericolo(availableCombos).map((g) => (
                <div key={`${g.sistema}||${g.pericolo}`}>
                  <div className="group-title">
                    {g.sistema} × {g.pericolo}
                  </div>
                  {g.items.map((c) => (
                    <div className="combo-row" key={comboKey(c)} onClick={() => openCombo(c)}>
                      <div className="cn">{c.field}</div>
                    </div>
                  ))}
                </div>
              ))}
        </>
      )}
    </div>
  )
}
