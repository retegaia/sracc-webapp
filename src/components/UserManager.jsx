import { useState } from 'react'
import { apiPost } from '../lib/apiClient.js'

const ROLE_LABEL = { coordinator: 'Coordinatore', contributor: 'Referente', observer: 'Osservatore' }

// Gestione utenti (S8, AdminPanel, §5.1): crea un utente e invia il magic
// link — stesso flusso già implementato in S2 (POST /api/magic-link), qui
// finalmente raggiungibile da una UI invece che solo dallo script di seed.
export default function UserManager({ users, error, onCreated }) {
  const [form, setForm] = useState({ email: '', name: '', discipline: '', role: 'contributor' })
  const [status, setStatus] = useState('idle') // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('')

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')
    try {
      await apiPost('magic-link', form)
      setForm({ email: '', name: '', discipline: '', role: 'contributor' })
      setStatus('idle')
      onCreated()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  return (
    <>
      <div className="card">
        <div className="ct">Utenti del territorio</div>
        {error && <p>Errore nel caricamento: {error}</p>}
        {!error && users === undefined && <p>Caricamento&hellip;</p>}
        {!error && users?.length === 0 && <div className="empty">Nessun utente ancora invitato.</div>}
        {!error && users && users.length > 0 && (
          <div className="admin-list">
            {users.map((u) => (
              <div className="admin-row" key={u.id}>
                <span className="ar-name">
                  {u.name}
                  {u.discipline && <span className="ar-sub"> — {u.discipline}</span>}
                </span>
                <span className="ar-badge">{ROLE_LABEL[u.role] || u.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <div className="ct">Invita un nuovo referente</div>
        <form onSubmit={submit}>
          <div className="sel-group">
            <label>Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />
          </div>
          <div className="sel-group">
            <label>Nome</label>
            <input type="text" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
          </div>
          <div className="sel-group">
            <label>Disciplina</label>
            <input type="text" value={form.discipline} onChange={(e) => setField('discipline', e.target.value)} />
          </div>
          <div className="sel-group">
            <label>Ruolo</label>
            <select value={form.role} onChange={(e) => setField('role', e.target.value)}>
              <option value="contributor">Referente</option>
              <option value="observer">Osservatore</option>
              <option value="coordinator">Coordinatore</option>
            </select>
          </div>
          {status === 'error' && <p style={{ color: 'var(--sf)' }}>Errore: {errorMsg}</p>}
          <div className="btn-row">
            <button className="btn-primary" type="submit" disabled={status === 'saving'}>
              {status === 'saving' ? 'Invio…' : 'Invia magic link'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
