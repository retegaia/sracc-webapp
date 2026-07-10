import { useState } from 'react'
import { apiDownload } from '../lib/apiClient.js'

// Quarta tab "Esporta" di Visualization.jsx (S9, 2026-07-10): genera
// lato server (netlify/functions/export.js) il file Word o Excel delle
// catene d'impatto nel formato del documento originale
// PAC_Barigadu_Guilcer_Catene_Impatto_v5_REV — Pericolo/Impact Field |
// Esposizione | Vulnerabilità (Sensibilità, Capacità adattiva) | Rischio
// atteso. Visibile a tutti i ruoli autenticati (come Bow-tie/Heatmap/Grafo)
// perché i dati mostrati ereditano la stessa restrizione già applicata da
// GET /api/contributions — nessun controllo aggiuntivo qui.
export default function ExportView() {
  const [format, setFormat] = useState('word')
  const [groupBy, setGroupBy] = useState('sistema-pericolo')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('')

  async function download() {
    setStatus('loading')
    setErrorMsg('')
    try {
      await apiDownload(`export?format=${format}&groupBy=${groupBy}`)
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  return (
    <div className="card">
      <div className="ct">Esporta catene d'impatto</div>
      <p style={{ fontSize: 12, color: '#666', marginTop: -6, marginBottom: 14 }}>
        Genera un documento con Esposizione, Vulnerabilità e Rischio atteso aggregati dai contributi visibili, più gli
        impatti attesi di libreria, nel formato delle tavole del documento originale.
      </p>
      <div className="sel-group">
        <label>Formato</label>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="word">Word (.docx)</option>
          <option value="excel">Excel (.xlsx)</option>
        </select>
      </div>
      <div className="sel-group">
        <label>Raggruppamento</label>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="sistema-pericolo">Per sistema × pericolo (una tavola per combinazione)</option>
          <option value="field">Per field, attraverso i pericoli</option>
        </select>
      </div>
      {status === 'error' && <p style={{ color: 'var(--sf)' }}>Errore: {errorMsg}</p>}
      <div className="btn-row">
        <button className="btn-primary" onClick={download} disabled={status === 'loading'}>
          {status === 'loading' ? 'Generazione…' : 'Genera e scarica'}
        </button>
      </div>
    </div>
  )
}
