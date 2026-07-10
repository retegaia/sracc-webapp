import { useState } from 'react'
import { useFactorTaxonomy } from '../hooks/useFactors.js'
import { apiPost } from '../lib/apiClient.js'

const ROLE_LABEL = { R: 'Responsabile (R)', A: 'Approvatore (A)', C: 'Consultato (C)', I: 'Informato (I)' }

// RACI editor (S8, AdminPanel): §3.1 Tab.2 elenca solo GET /api/raci — la
// scrittura (POST /api/raci) è un'aggiunta di S8, non nella specifica
// originale (confermato con Andrea Vallebona il 2026-07-10). Nessun
// prototipo di riferimento: lista delle assegnazioni esistenti + form per
// aggiungerne/modificarne una, non una matrice a griglia.
export default function RaciEditor({ users, raci, error, onChanged }) {
  const { tree, error: taxError } = useFactorTaxonomy()
  const [form, setForm] = useState({ user_id: '', sistema: '', pericolo: '', field: '', role: 'R' })
  const [status, setStatus] = useState('idle') // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('')

  const sistemi = tree ? Object.keys(tree) : []
  const pericoli = tree && form.sistema ? Object.keys(tree[form.sistema] ?? {}) : []
  const fields = tree && form.sistema && form.pericolo ? tree[form.sistema]?.[form.pericolo] ?? [] : []

  function setField(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'sistema') {
        next.pericolo = ''
        next.field = ''
      }
      if (key === 'pericolo') next.field = ''
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')
    try {
      await apiPost('raci', form)
      setForm((f) => ({ ...f, sistema: '', pericolo: '', field: '' }))
      setStatus('idle')
      onChanged()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  async function remove(row) {
    try {
      await apiPost('raci', {
        user_id: row.user_id,
        sistema: row.sistema,
        pericolo: row.pericolo,
        field: row.field,
        role: null,
      })
      onChanged()
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  return (
    <>
      <div className="card">
        <div className="ct">Assegnazioni RACI</div>
        {error && <p>Errore nel caricamento: {error}</p>}
        {!error && raci === undefined && <p>Caricamento&hellip;</p>}
        {!error && raci?.length === 0 && <div className="empty">Nessuna assegnazione ancora presente.</div>}
        {!error && raci && raci.length > 0 && (
          <div className="admin-list">
            {raci.map((r) => (
              <div className="admin-row" key={r.id}>
                <span className="ar-name">
                  {r.users?.name ?? 'Utente sconosciuto'}
                  <span className="ar-sub">
                    {' '}
                    — {r.sistema} × {r.pericolo} × {r.field}
                  </span>
                </span>
                <span className="ar-badge">{r.role}</span>
                <button className="ar-rm" onClick={() => remove(r)} title="Rimuovi">
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <div className="ct">Aggiungi o modifica un'assegnazione</div>
        {taxError && <p>Errore nel caricamento della libreria: {taxError}</p>}
        <form onSubmit={submit}>
          <div className="sel-group">
            <label>Utente</label>
            <select required value={form.user_id} onChange={(e) => setField('user_id', e.target.value)}>
              <option value="">&mdash; seleziona &mdash;</option>
              {(users || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sel-group">
            <label>Sistema</label>
            <select required value={form.sistema} onChange={(e) => setField('sistema', e.target.value)}>
              <option value="">&mdash; seleziona &mdash;</option>
              {sistemi.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="sel-group">
            <label>Pericolo</label>
            <select
              required
              value={form.pericolo}
              disabled={!form.sistema}
              onChange={(e) => setField('pericolo', e.target.value)}
            >
              <option value="">&mdash; seleziona &mdash;</option>
              {pericoli.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="sel-group">
            <label>Impact field</label>
            <select
              required
              value={form.field}
              disabled={!form.pericolo}
              onChange={(e) => setField('field', e.target.value)}
            >
              <option value="">&mdash; seleziona &mdash;</option>
              {fields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="sel-group">
            <label>Ruolo</label>
            <select value={form.role} onChange={(e) => setField('role', e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {status === 'error' && <p style={{ color: 'var(--sf)' }}>Errore: {errorMsg}</p>}
          <div className="btn-row">
            <button className="btn-primary" type="submit" disabled={status === 'saving'}>
              {status === 'saving' ? 'Salvataggio…' : 'Salva assegnazione'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
