import { useMemo, useState } from 'react'
import { useFactorTaxonomy } from '../hooks/useFactors.js'
import { apiPost, apiDelete } from '../lib/apiClient.js'

function comboKey(pericolo, field) {
  return `${pericolo}|||${field}`
}

// Tab "Combinazioni" in /admin (2026-07-16): attiva/disattiva per il
// territorio corrente le combinazioni sistema×pericolo×field che
// StepSelector.jsx (form di compilazione) e RaciEditor.jsx (assegnazione
// referente) mostrano come compilabili/assegnabili — v. useActiveTaxonomy
// in useFactors.js, tabella combinazioni_attive. Prima di questa tab
// l'unico modo per popolarla era uno script una tantum
// (seed-combinazioni-attive.js).
//
// L'elenco dei pericolo×field possibili per un sistema viene dalla
// libreria GLOBALE non filtrata (useFactorTaxonomy, la stessa di
// HeatMap.jsx/ResetScheda.jsx) — usare la tassonomia ATTIVA qui sarebbe
// circolare: mostrerebbe solo ciò che è già attivo, inutile per attivare
// qualcosa di nuovo (il caso d'uso principale è il bootstrap di un
// territorio nuovo come Sinnai, che parte da zero combinazioni attive).
//
// Ogni toggle persiste immediatamente al click (POST attiva / DELETE
// disattiva) — nessun submit unico a fondo pagina, a differenza di
// RaciEditor: qui il caso d'uso è gestione ordinaria con variazioni
// singole e frequenti, non un'assegnazione batch una tantum.
export default function CombinazioniManager({ combinazioni, error, onChanged }) {
  const { tree, error: taxError } = useFactorTaxonomy()
  const [sistema, setSistema] = useState('')
  const [status, setStatus] = useState({}) // comboKey -> 'saving' | 'error'

  const sistemi = tree ? Object.keys(tree).sort() : []

  const rows = useMemo(() => {
    if (!tree || !sistema) return []
    const list = []
    for (const [pericolo, fields] of Object.entries(tree[sistema] ?? {})) {
      for (const field of fields) list.push({ pericolo, field })
    }
    return list.sort((a, b) => a.pericolo.localeCompare(b.pericolo) || a.field.localeCompare(b.field))
  }, [tree, sistema])

  const activeSet = useMemo(() => {
    const s = new Set()
    for (const c of combinazioni || []) {
      if (c.sistema === sistema) s.add(comboKey(c.pericolo, c.field))
    }
    return s
  }, [combinazioni, sistema])

  function setRowStatus(key, value) {
    setStatus((s) => ({ ...s, [key]: value }))
  }

  async function toggle(row, activate) {
    const key = comboKey(row.pericolo, row.field)
    setRowStatus(key, 'saving')
    try {
      if (activate) await apiPost('combinazioni-attive', { sistema, pericolo: row.pericolo, field: row.field })
      else await apiDelete('combinazioni-attive', { sistema, pericolo: row.pericolo, field: row.field })
      setRowStatus(key, 'idle')
      onChanged()
    } catch {
      setRowStatus(key, 'error')
    }
  }

  // Attiva/disattiva tutte le combinazioni del sistema corrente in un
  // colpo solo (bootstrap di un territorio nuovo) — nessun endpoint batch
  // lato server, stesso fan-out client-side già usato in RaciEditor.
  async function toggleAll(activate) {
    await Promise.all(
      rows.map((row) => {
        const key = comboKey(row.pericolo, row.field)
        if (activate === activeSet.has(key)) return null
        setRowStatus(key, 'saving')
        const call = activate
          ? apiPost('combinazioni-attive', { sistema, pericolo: row.pericolo, field: row.field })
          : apiDelete('combinazioni-attive', { sistema, pericolo: row.pericolo, field: row.field })
        return call.then(() => setRowStatus(key, 'idle')).catch(() => setRowStatus(key, 'error'))
      })
    )
    onChanged()
  }

  return (
    <div className="card">
      <div className="ct">Combinazioni attive</div>
      <div className="note-info">
        Attiva o disattiva le combinazioni sistema × pericolo × field compilabili in Form e assegnabili in RACI per
        questo territorio. L'elenco qui sotto è la libreria condivisa completa — attivarne una la rende
        visibile/assegnabile, senza modificare la libreria stessa.
      </div>
      {error && <p>Errore nel caricamento delle combinazioni attive: {error}</p>}
      {taxError && <p>Errore nel caricamento della libreria: {taxError}</p>}
      <div className="sel-group">
        <label>Sistema</label>
        <select value={sistema} onChange={(e) => setSistema(e.target.value)}>
          <option value="">&mdash; seleziona &mdash;</option>
          {sistemi.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {sistema && combinazioni === undefined && <p>Caricamento&hellip;</p>}

      {sistema && combinazioni !== undefined && (
        <div className="field-checklist">
          <div className="field-check-header">
            <button type="button" onClick={() => toggleAll(true)}>
              Seleziona tutti
            </button>
            <button type="button" onClick={() => toggleAll(false)}>
              Deseleziona tutti
            </button>
            <span className="field-check-count">
              {activeSet.size} / {rows.length} attive
            </span>
          </div>
          {rows.map((row) => {
            const key = comboKey(row.pericolo, row.field)
            const isActive = activeSet.has(key)
            const rowStatus = status[key]
            return (
              <label className="field-check-item" key={key}>
                <input
                  type="checkbox"
                  checked={isActive}
                  disabled={rowStatus === 'saving'}
                  onChange={() => toggle(row, !isActive)}
                />
                <span>
                  {row.pericolo} × {row.field}
                </span>
                {rowStatus === 'saving' && <span className="field-check-tag saving">salvataggio&hellip;</span>}
                {rowStatus === 'error' && <span className="field-check-tag error">errore</span>}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
