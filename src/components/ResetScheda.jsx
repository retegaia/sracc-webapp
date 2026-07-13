import { useMemo, useState } from 'react'
import { useFactorTaxonomy } from '../hooks/useFactors.js'
import { useIndicatoriScelti } from '../hooks/useIndicatori.js'
import ResetButton from './ResetButton.jsx'

// Sezione "Resetta scheda" in /admin: non esiste oggi una vista che elenchi
// le righe di indicatori_scelti (solo contributions è visibile in
// AggregatedView), quindi invece di costruire una nuova visualizzazione il
// coordinatore individua la scheda da resettare compilando questo form —
// stesso stile lista+form di RaciEditor, non una tabella. Per le catene
// d'impatto esiste anche un pulsante diretto in AggregatedView (righe già
// visibili lì); questo form resta l'unico modo per resettare una selezione
// indicatori altrui, dato che non c'è ancora una vista coordinatore per
// indicatori_scelti.
export default function ResetScheda({ users }) {
  const { tree, error: taxError } = useFactorTaxonomy()
  const [form, setForm] = useState({ user_id: '', tipo: 'contributions', sistema: '', pericolo: '', field: '' })
  const [lastReset, setLastReset] = useState(null)

  const sistemi = tree ? Object.keys(tree) : []
  const pericoli = form.sistema ? Object.keys(tree[form.sistema] ?? {}) : []
  const fields = form.sistema && form.pericolo ? tree[form.sistema]?.[form.pericolo] ?? [] : []

  // Avviso non bloccante (deciso con Andrea): resettare una contributions
  // non tocca automaticamente un'eventuale indicatori_scelti collegata
  // allo stesso field, e viceversa — sono due azioni indipendenti per
  // design (v. contributions-reset.js / indicatori-scelti-reset.js).
  // Quando il tipo scelto è "catena d'impatto" e la combinazione è
  // completa, controlliamo se esiste già una riga indicatori_scelti per lo
  // stesso referente/field e la segnaliamo, senza impedire il reset.
  const { indicatoriScelti } = useIndicatoriScelti(
    form.tipo === 'contributions' ? form.sistema : undefined,
    form.tipo === 'contributions' ? form.pericolo : undefined
  )
  const linkedIndicatori = useMemo(() => {
    if (form.tipo !== 'contributions' || !indicatoriScelti || !form.field || !form.user_id) return null
    return indicatoriScelti.find((r) => r.field === form.field && r.user_id === form.user_id) ?? null
  }, [form.tipo, form.field, form.user_id, indicatoriScelti])

  function setField(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'tipo') {
        next.sistema = ''
        next.pericolo = ''
        next.field = ''
      }
      if (key === 'sistema') {
        next.pericolo = ''
        next.field = ''
      }
      if (key === 'pericolo') next.field = ''
      return next
    })
    setLastReset(null)
  }

  const complete = form.user_id && form.sistema && form.pericolo && form.field

  return (
    <div className="card">
      <div className="ct">Resetta scheda</div>
      <div className="note-info">
        Riporta una scheda a bozza vuota (contenuto svuotato, status draft) senza cancellarla. Azione irreversibile
        — richiede conferma esplicita prima di eseguire.
      </div>
      {taxError && <p>Errore nel caricamento della libreria: {taxError}</p>}
      <div className="sel-group">
        <label>Tipo di scheda</label>
        <select value={form.tipo} onChange={(e) => setField('tipo', e.target.value)}>
          <option value="contributions">Catena d'impatto</option>
          <option value="indicatori-scelti">Selezione indicatori</option>
        </select>
      </div>
      <div className="sel-group">
        <label>Referente</label>
        <select value={form.user_id} onChange={(e) => setField('user_id', e.target.value)}>
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
        <select value={form.sistema} onChange={(e) => setField('sistema', e.target.value)}>
          <option value="">&mdash; seleziona &mdash;</option>
          {sistemi.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="sel-group">
        <label>Pericolo climatico</label>
        <select value={form.pericolo} disabled={!form.sistema} onChange={(e) => setField('pericolo', e.target.value)}>
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
        <select value={form.field} disabled={!form.pericolo} onChange={(e) => setField('field', e.target.value)}>
          <option value="">&mdash; seleziona &mdash;</option>
          {fields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      {linkedIndicatori && (
        <p style={{ fontSize: 12, color: 'var(--sf)' }}>
          Attenzione: esiste già una selezione di indicatori ({linkedIndicatori.status}) per questo referente su
          questo field. Resettare la catena d'impatto non la tocca automaticamente — se necessario resettala a
          parte scegliendo "Selezione indicatori" come tipo.
        </p>
      )}

      {lastReset && <p style={{ color: 'var(--cf)' }}>Scheda resettata.</p>}

      {complete && (
        <div className="btn-row">
          <ResetButton
            kind={form.tipo}
            sistema={form.sistema}
            pericolo={form.pericolo}
            field={form.field}
            user_id={form.user_id}
            label="Resetta questa scheda"
            onReset={() => setLastReset(Date.now())}
          />
        </div>
      )}
    </div>
  )
}
