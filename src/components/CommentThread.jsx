import { useState } from 'react'
import { apiGet, apiPost } from '../lib/apiClient.js'
import '../styles/commentThread.css'

// Modulo commenti (2026-07-15): thread append-only su un fattore
// (/api/fattori-commenti) o un indicatore (/api/indicatori-commenti),
// aperto a coordinator/contributor senza filtro RACI — chi non ha ruolo R
// su una combinazione partecipa comunque da qui invece che con una seconda
// scheda scrivente (regola C1, S8). `params` è passato as-is sia come
// query string (GET) sia spalmato nel body (POST + testo) — stessa forma
// dei due endpoint, {indicatore_id} o {sistema,pericolo,field,fattore_nome},
// quindi nessuna logica if/else per "quale tipo di commento" serve qui.
//
// Caricato solo all'apertura del thread (non al mount del genitore, che
// altrimenti farebbe una GET per ogni fattore/indicatore visibile anche se
// nessuno lo apre mai — stesso principio lazy già seguito da SignalView
// per /api/ai/overlaps, S5). Il chiamante (FactorChips.jsx/
// IndicatorSelector.jsx) è responsabile di non montare affatto questo
// componente per role === 'observer' — qui non c'è un controllo di ruolo
// perché il componente non ha visibilità sul ruolo attivo, solo il
// genitore la ha via useActiveTerritory().
export default function CommentThread({ path, params }) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState(undefined) // undefined = mai caricato
  const [error, setError] = useState(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    const qs = new URLSearchParams(params).toString()
    apiGet(`${path}?${qs}`)
      .then(({ commenti }) => setComments(commenti))
      .catch((err) => setError(err.message))
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && comments === undefined) load()
  }

  async function submit() {
    const testo = text.trim()
    if (!testo) return
    setSaving(true)
    setError(null)
    try {
      await apiPost(path, { ...params, testo })
      setText('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="comment-thread">
      <button type="button" className="ct-toggle" onClick={toggle}>
        {open ? 'Nascondi commenti' : `Commenti${comments ? ` (${comments.length})` : ''}`}
      </button>
      {open && (
        <div className="ct-body">
          {error && <p className="ct-error">Errore: {error}</p>}
          {comments === undefined && !error && <p className="ct-loading">Caricamento&hellip;</p>}
          {comments?.length === 0 && <p className="ct-empty">Nessun commento.</p>}
          {comments?.map((c) => (
            <div className="ct-item" key={c.id}>
              <div className="ct-meta">
                <strong>{c.users?.name ?? 'Utente'}</strong>
                {c.users?.discipline && <span className="ct-disc"> — {c.users.discipline}</span>}
              </div>
              <div className="ct-text">{c.testo}</div>
            </div>
          ))}
          <div className="ct-add">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Aggiungi un commento&hellip;"
            />
            <button type="button" onClick={submit} disabled={saving || !text.trim()}>
              {saving ? 'Invio…' : 'Aggiungi'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
