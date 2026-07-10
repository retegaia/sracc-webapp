import { useState } from 'react'
import { useFieldFactors } from '../hooks/useFactors.js'
import { apiPost } from '../lib/apiClient.js'

const COMPONENTI = ['Esposizione', 'Sensibilita', 'Capacita adattiva']
const LABELS = { Esposizione: 'Esposizione', Sensibilita: 'Sensibilità', 'Capacita adattiva': 'Capacità adattiva' }
const CSS_KEY = { Esposizione: 'esp', Sensibilita: 'sen', 'Capacita adattiva': 'cap' }
const CONFIDENZA_LABEL = { alta: 'alta', media: 'media', bassa: 'bassa' }

// Passo 2 del form referente (Tab.4): fetch da API al mount, scoped al field
// corrente. L'aggiunta di un fattore a testo libero chiama /api/ai/classify
// (S5, §6.1) per precompilare la componente suggerita — il referente resta
// libero di correggerla scegliendo un altro pulsante (§3.2).
export default function FactorChips({ sistema, pericolo, field, selected, onSelectedChange, onBack, onNext }) {
  const { factors, error } = useFieldFactors(sistema, pericolo, field)
  const [freeText, setFreeText] = useState('')
  const [showCompSel, setShowCompSel] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState(null)

  function toggle(f) {
    const idx = selected.findIndex((x) => x.nome === f.nome_std && x.componente === f.componente)
    if (idx >= 0) {
      onSelectedChange(selected.filter((_, i) => i !== idx))
    } else {
      onSelectedChange([
        ...selected,
        { factor_id: f.id, nome: f.nome_std, componente: f.componente, strato: f.strato, fonte: f.fonte_std, peso: null, free: false },
      ])
    }
  }

  function addFree(componente) {
    const nome = freeText.trim()
    if (!nome) return
    onSelectedChange([
      ...selected,
      { factor_id: null, nome, componente, strato: 'ST', fonte: '', peso: null, free: true },
    ])
    setFreeText('')
    setShowCompSel(false)
    setAiSuggestion(null)
  }

  function remove(i) {
    onSelectedChange(selected.filter((_, idx) => idx !== i))
  }

  function openCompSel() {
    const testo = freeText.trim()
    if (!testo) return
    setShowCompSel(true)
    setAiSuggestion(null)
    setClassifying(true)
    apiPost('ai/classify', { testo, sistema, pericolo, field })
      .then((suggestion) => setAiSuggestion(suggestion))
      .catch(() => setAiSuggestion(null))
      .finally(() => setClassifying(false))
  }

  if (error) return <p>Errore nel caricamento dei fattori: {error}</p>
  if (!factors) return <p>Caricamento fattori&hellip;</p>

  return (
    <>
      <div className="card">
        <div className="ct">Fattori dalla libreria &mdash; {field}</div>
        <div className="note-info">Seleziona i fattori presenti nel territorio. IN = invariante nazionale.</div>
        {COMPONENTI.map((comp) => {
          const items = factors.filter((f) => f.componente === comp)
          if (!items.length) return null
          return (
            <div key={comp}>
              <div className={`comp-hdr ${CSS_KEY[comp]}`}>{LABELS[comp]}</div>
              <div className="chips">
                {items.map((f) => {
                  const isSel = selected.some((x) => x.nome === f.nome_std && x.componente === f.componente)
                  return (
                    <span
                      key={f.id}
                      className={`chip ${isSel ? `sel-${CSS_KEY[comp]}` : ''}${f.strato === 'IN' ? ' in' : ''}`}
                      onClick={() => toggle(f)}
                    >
                      {f.nome_std}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="card">
        <div className="ct">Aggiungi fattore specifico del territorio</div>
        <div className="free-row">
          <input
            type="text"
            placeholder="Descrivi il fattore nel tuo linguaggio&hellip;"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
          />
          <button className="btn-outline" onClick={openCompSel}>
            + Aggiungi
          </button>
        </div>
        {showCompSel && (
          <div className="comp-sel">
            <p>Seleziona la componente per questo fattore:</p>
            {classifying && <div className="ai-note">Classificazione AI in corso&hellip;</div>}
            {!classifying && aiSuggestion && (
              <div className="ai-note">
                Suggerimento AI: <strong>{LABELS[aiSuggestion.componente]}</strong>
                {' '}(confidenza {CONFIDENZA_LABEL[aiSuggestion.confidenza] || aiSuggestion.confidenza})
                {aiSuggestion.motivazione && ` — ${aiSuggestion.motivazione}`}
              </div>
            )}
            <div className="comp-btns">
              {COMPONENTI.map((c) => (
                <button
                  key={c}
                  className={aiSuggestion?.componente === c ? 'ai-suggested' : undefined}
                  onClick={() => addFree(c)}
                >
                  {LABELS[c]}
                </button>
              ))}
              <button onClick={() => setShowCompSel(false)} style={{ fontSize: 12 }}>Annulla</button>
            </div>
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="card">
          <div className="ct">Fattori selezionati ({selected.length})</div>
          <div className="sel-list">
            {selected.map((f, i) => (
              <div className="sel-item" key={`${f.nome}-${f.componente}-${i}`}>
                <span className={`si-pill pi-${CSS_KEY[f.componente]}`}>{LABELS[f.componente]}</span>
                <span className="si-name">
                  {f.nome}
                  {f.free && <em style={{ fontSize: 11, color: '#999' }}> [aggiunto]</em>}
                </span>
                <button className="si-rm" onClick={() => remove(i)} title="Rimuovi">&times;</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="btn-row">
        <button onClick={onBack}>&larr; Indietro</button>
        {selected.length > 0 && (
          <button className="btn-primary" onClick={onNext}>Pesatura &rarr;</button>
        )}
      </div>
    </>
  )
}
