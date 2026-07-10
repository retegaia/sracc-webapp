import { useEffect, useState } from 'react'
import { apiPost } from '../lib/apiClient.js'

// Configurazione territorio (S8, AdminPanel): solo name/region. Il campo
// territories.config (jsonb — pericoli/field attivi, metadati) resta fuori
// scope: nessun'altra parte dell'app lo legge oggi — deviazione confermata
// con Andrea Vallebona il 2026-07-10.
export default function TerritoryConfig({ territory, error, onSaved }) {
  const [form, setForm] = useState({ name: '', region: '' })
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (territory) setForm({ name: territory.name ?? '', region: territory.region ?? '' })
  }, [territory])

  async function submit(e) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')
    try {
      await apiPost('territory', form)
      setStatus('saved')
      onSaved()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  if (error) return <p>Errore nel caricamento: {error}</p>
  if (territory === undefined) return <p>Caricamento&hellip;</p>

  return (
    <div className="card">
      <div className="ct">Territorio</div>
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
        {status === 'saved' && <p style={{ color: 'var(--cf)' }}>Salvato.</p>}
        {status === 'error' && <p style={{ color: 'var(--sf)' }}>Errore: {errorMsg}</p>}
        <div className="btn-row">
          <button className="btn-primary" type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </form>
    </div>
  )
}
