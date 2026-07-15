import { useState } from 'react'
import { apiPost } from '../lib/apiClient.js'

const ROLE_LABEL = { coordinator: 'Coordinatore', contributor: 'Referente', observer: 'Osservatore' }
const ROLES = ['contributor', 'observer', 'coordinator']

// Gestione utenti (S8, AdminPanel, §5.1): crea un utente e invia il magic
// link — stesso flusso già implementato in S2 (POST /api/magic-link), qui
// finalmente raggiungibile da una UI invece che solo dallo script di seed.
//
// Modifica ruolo di un utente esistente (aggiunta 2026-07-15, verifica
// ruolo osservatore): select inline per riga, POST /api/users — azione
// distinta dall'invito, non tocca Supabase Auth né invia email (a
// differenza di ri-sottomettere il form di invito con la stessa email, che
// prima d'ora era l'unico modo — indiretto e non documentato — per
// cambiare il ruolo di un utente già esistente in questo territorio).
export default function UserManager({ users, error, onCreated }) {
  const [form, setForm] = useState({ email: '', name: '', discipline: '', role: 'contributor' })
  const [status, setStatus] = useState('idle') // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('')
  const [roleSaving, setRoleSaving] = useState(null) // user_id in corso di salvataggio, o null
  const [roleError, setRoleError] = useState(null) // { userId, message } | null

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

  async function changeRole(userId, role) {
    setRoleSaving(userId)
    setRoleError(null)
    try {
      await apiPost('users', { user_id: userId, role })
      onCreated()
    } catch (err) {
      setRoleError({ userId, message: err.message })
    } finally {
      setRoleSaving(null)
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
                <select
                  value={u.role}
                  disabled={roleSaving === u.id}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                  style={{ fontSize: 12 }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                {roleError?.userId === u.id && (
                  <span style={{ fontSize: 11, color: 'var(--sf)' }}>Errore: {roleError.message}</span>
                )}
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
