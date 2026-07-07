import { useState } from 'react'
import { apiPost } from '../lib/apiClient.js'
import { computeVuln } from './WeightingPanel.jsx'

function buildPayload({ sistema, pericolo, field, selected, note, status }) {
  return {
    sistema,
    pericolo,
    field,
    factors: selected,
    vulnerability: computeVuln(selected),
    note,
    status,
  }
}

function downloadJSON(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `contributo_${payload.sistema.slice(0, 3)}_${payload.pericolo.slice(0, 3)}_${payload.field.slice(0, 8)}.json`
    .replace(/[^a-z0-9_.]/gi, '_')
  a.click()
  URL.revokeObjectURL(a.href)
}

// Passo 4 del form referente (Tab.4): l'export JSON del prototipo diventa il
// bottone "Invia contributo" (POST /api/contributions); il download resta
// come fallback se la POST fallisce (rete assente, sessione scaduta, ecc.).
export default function NotesExport({ sistema, pericolo, field, selected, note, onNoteChange, onBack }) {
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState('')

  const v = computeVuln(selected)
  const summary = [
    `Sistema: ${sistema}`,
    `Pericolo: ${pericolo}`,
    `Field: ${field}`,
    '',
    `Fattori selezionati (${selected.length}):`,
    ...selected.map((f) => `  [${f.componente}] ${f.nome}${f.peso ? ' — ' + f.peso : ''}`),
    '',
    v ? `Sensibilità: ${v.sen} | Cap. adattiva: ${v.cap} | Rischio: ${v.rischio}` : '',
    note ? `\nNote: ${note}` : '',
  ].join('\n')

  async function submit() {
    setStatus('saving')
    setErrorMsg('')
    try {
      await apiPost('contributions', buildPayload({ sistema, pericolo, field, selected, note, status: 'submitted' }))
      setStatus('saved')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  function fallbackDownload() {
    downloadJSON(buildPayload({ sistema, pericolo, field, selected, note, status: 'submitted' }))
  }

  return (
    <>
      <div className="card">
        <div className="ct">Note e segnalazioni</div>
        <div className="note-info">Dataset disponibili, limitazioni note, osservazioni qualitative.</div>
        <textarea
          placeholder="Campo libero — spesso il contributo più prezioso per il coordinatore."
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
        />
      </div>
      <div className="card">
        <div className="ct">Riepilogo contributo</div>
        {v && (
          <div className={`r-badge r-${v.rischio}`} style={{ marginBottom: 10 }}>
            Rischio preliminare: {v.rischio}
          </div>
        )}
        <div className="out">{summary}</div>
      </div>
      {status === 'saved' && <p style={{ color: 'var(--cf)' }}>Contributo salvato.</p>}
      {status === 'error' && (
        <p style={{ color: 'var(--sf)' }}>Errore: {errorMsg} — puoi scaricare il JSON come fallback.</p>
      )}
      <div className="btn-row">
        <button onClick={onBack}>&larr; Indietro</button>
        <button className="btn-primary" onClick={submit} disabled={status === 'saving'}>
          {status === 'saving' ? 'Invio…' : 'Invia contributo'}
        </button>
        <button onClick={fallbackDownload}>&#8681; Esporta JSON</button>
      </div>
    </>
  )
}
