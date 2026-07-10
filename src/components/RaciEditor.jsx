import { useMemo, useState } from 'react'
import { useFactorTaxonomy } from '../hooks/useFactors.js'
import { apiPost } from '../lib/apiClient.js'

const ROLE_LABEL = { R: 'Responsabile (R)', A: 'Approvatore (A)', C: 'Consultato (C)', I: 'Informato (I)' }

// Raggruppa le righe RACI per (utente, sistema, field, ruolo) — nella
// pratica un esperto ha lo stesso ruolo su un field a prescindere dal
// pericolo (v. sotto), quindi elencare ogni riga separatamente appesantiva
// la lettura senza aggiungere informazione. "Tutti i pericoli" quando il
// gruppo copre l'intero set di pericoli noti per quel sistema (dalla
// libreria, tree[sistema]); altrimenti elenca i pericoli effettivamente
// presenti — così un'eventuale assegnazione parziale (dati storici, o
// creata prima di questa modifica) resta leggibile e non viene falsata.
function groupRaci(raci, tree) {
  const groups = new Map()
  for (const r of raci) {
    const key = `${r.user_id}|||${r.sistema}|||${r.field}|||${r.role}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        user_id: r.user_id,
        userName: r.users?.name ?? 'Utente sconosciuto',
        sistema: r.sistema,
        field: r.field,
        role: r.role,
        rows: [],
      })
    }
    groups.get(key).rows.push(r)
  }
  return [...groups.values()]
    .map((g) => {
      const pericoliInGroup = [...new Set(g.rows.map((r) => r.pericolo))]
      const allPericoli = tree?.[g.sistema] ? Object.keys(tree[g.sistema]) : []
      const isAll = allPericoli.length > 0 && pericoliInGroup.length === allPericoli.length
      return { ...g, pericoli: pericoliInGroup, isAll }
    })
    .sort((a, b) => a.sistema.localeCompare(b.sistema) || a.field.localeCompare(b.field) || a.userName.localeCompare(b.userName))
}

// RACI editor (S8, AdminPanel; semplificato il 2026-07-10). §3.1 Tab.2
// elenca solo GET /api/raci — la scrittura (POST /api/raci) resta
// un'aggiunta di S8, non nella specifica originale. Nessun prototipo di
// riferimento: lista delle assegnazioni esistenti + form per
// aggiungerne/modificarne una, non una matrice a griglia.
//
// Il form non chiede più il pericolo: nella matrice RACI reale un esperto
// (urbanista, naturalista, ecc.) è assegnato per field, con lo stesso
// ruolo su tutti i pericoli di quel sistema — chiedere di ripetere la
// stessa scelta 3-4 volte era puro attrito. Al salvataggio si determinano
// i pericoli reali del sistema scelto da useFactorTaxonomy (GET
// /api/factors, stesso principio già seguito per gli assi della HeatMap
// in S6 — non hardcodati) e si invia una POST /api/raci per ciascuno,
// stesso utente/sistema/field/ruolo. Backend (raci.js) e isAssigned in
// contributions.js restano invariati: il form si limita a chiamare
// l'endpoint di upsert/cancellazione già esistente N volte invece di una.
export default function RaciEditor({ users, raci, error, onChanged }) {
  const { tree, error: taxError } = useFactorTaxonomy()
  const [form, setForm] = useState({ user_id: '', sistema: '', field: '', role: 'R' })
  const [status, setStatus] = useState('idle') // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('')

  const sistemi = tree ? Object.keys(tree) : []
  // Union dei field su tutti i pericoli del sistema scelto: senza il passo
  // "pericolo" nel form, l'elenco dei field possibili non può più essere
  // filtrato per una singola coppia sistema+pericolo.
  const fields = useMemo(() => {
    if (!tree || !form.sistema) return []
    const all = new Set()
    for (const list of Object.values(tree[form.sistema] ?? {})) {
      for (const f of list) all.add(f)
    }
    return [...all].sort()
  }, [tree, form.sistema])

  const grouped = useMemo(() => groupRaci(raci || [], tree), [raci, tree])

  function setField(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'sistema') next.field = ''
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')
    try {
      const pericoli = tree?.[form.sistema] ? Object.keys(tree[form.sistema]) : []
      if (!pericoli.length) throw new Error('nessun pericolo trovato per questo sistema nella libreria')
      await Promise.all(
        pericoli.map((pericolo) =>
          apiPost('raci', { user_id: form.user_id, sistema: form.sistema, pericolo, field: form.field, role: form.role })
        )
      )
      setForm((f) => ({ ...f, sistema: '', field: '' }))
      setStatus('idle')
      onChanged()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  async function removeGroup(group) {
    try {
      await Promise.all(
        group.rows.map((r) =>
          apiPost('raci', { user_id: r.user_id, sistema: r.sistema, pericolo: r.pericolo, field: r.field, role: null })
        )
      )
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
        {!error && grouped.length === 0 && <div className="empty">Nessuna assegnazione ancora presente.</div>}
        {!error && grouped.length > 0 && (
          <div className="admin-list">
            {grouped.map((g) => (
              <div className="admin-row" key={g.key}>
                <span className="ar-name">
                  {g.userName}
                  <span className="ar-sub">
                    {' '}
                    — {g.sistema} × {g.field} — {g.isAll ? 'tutti i pericoli' : g.pericoli.join(', ')}
                  </span>
                </span>
                <span className="ar-badge">{g.role}</span>
                <button className="ar-rm" onClick={() => removeGroup(g)} title="Rimuovi">
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <div className="ct">Aggiungi o modifica un'assegnazione</div>
        <div className="note-info">Il ruolo scelto vale per il field su tutti i pericoli del sistema selezionato.</div>
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
            <label>Impact field</label>
            <select
              required
              value={form.field}
              disabled={!form.sistema}
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
