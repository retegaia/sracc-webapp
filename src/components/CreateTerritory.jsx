import { useState } from 'react'
import { apiPost } from '../lib/apiClient.js'
import { useActiveTerritory } from '../contexts/TerritoryContext.jsx'

// Creazione di un nuovo territorio (multi-territorio, 2026-07-11) — distinto
// da TerritoryConfig (che modifica il territorio attivo): POST
// /api/territories (plurale, creazione), il creatore diventa
// automaticamente coordinator del nuovo territorio. Nessun cambio
// automatico del territorio attivo alla creazione (niente selettore
// persistente, v. "Cambia territorio" in AppNav) — si aggiorna solo
// l'elenco disponibile, così il nuovo territorio compare la prossima volta
// che si passa dalla schermata di scelta.
export default function CreateTerritory() {
  const { refetch } = useActiveTerritory()
  const [form, setForm] = useState({ name: '', region: '' })
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState('')

  async function submit(e) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')
    try {
      await apiPost('territories', form)
      setForm({ name: '', region: '' })
      setStatus('saved')
      refetch()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  return (
    <div className="card">
      <div className="ct">Crea nuovo territorio</div>
      <p style={{ fontSize: 12, color: '#999' }}>
        Diventerai automaticamente coordinatore del nuovo territorio. Per operarci in questa sessione, usa &laquo;Cambia
        territorio&raquo; nella barra di navigazione.
      </p>
      <form onSubmit={submit}>
        <div className="sel-group">
          <label>Nome</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="sel-group">
          <label>Regione</label>
          <input
            type="text"
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
          />
        </div>
        {status === 'saved' && <p style={{ color: 'var(--cf)' }}>Territorio creato.</p>}
        {status === 'error' && <p style={{ color: 'var(--sf)' }}>Errore: {errorMsg}</p>}
        <div className="btn-row">
          <button className="btn-primary" type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Creazione…' : 'Crea territorio'}
          </button>
        </div>
      </form>
    </div>
  )
}
