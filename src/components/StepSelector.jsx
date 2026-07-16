import { useActiveTaxonomy } from '../hooks/useFactors.js'

// Passo 1 del form referente (Tab.4): tendine a cascata sistema→pericolo→field,
// alimentate da GET /api/combinazioni-attive (2026-07-16) — solo le
// combinazioni attivate per il territorio corrente, non l'intera libreria
// condivisa factors (v. useActiveTaxonomy in useFactors.js).
export default function StepSelector({ sistema, pericolo, field, onChange, onNext }) {
  const { tree, error } = useActiveTaxonomy()

  if (error) return <p>Errore nel caricamento della libreria: {error}</p>
  if (!tree) return <p>Caricamento libreria&hellip;</p>

  const sistemi = Object.keys(tree)
  const pericoli = sistema ? Object.keys(tree[sistema] ?? {}) : []
  const fields = sistema && pericolo ? tree[sistema]?.[pericolo] ?? [] : []

  return (
    <div className="card">
      <div className="ct">Contesto di compilazione</div>
      <div className="sel-group">
        <label>Sistema impattato</label>
        <select
          value={sistema}
          onChange={(e) => onChange({ sistema: e.target.value, pericolo: '', field: '' })}
        >
          <option value="">&mdash; seleziona &mdash;</option>
          {sistemi.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="sel-group">
        <label>Pericolo climatico</label>
        <select
          value={pericolo}
          disabled={!sistema}
          onChange={(e) => onChange({ sistema, pericolo: e.target.value, field: '' })}
        >
          <option value="">&mdash; seleziona &mdash;</option>
          {pericoli.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="sel-group">
        <label>Impact field</label>
        <select
          value={field}
          disabled={!pericolo}
          onChange={(e) => onChange({ sistema, pericolo, field: e.target.value })}
        >
          <option value="">&mdash; seleziona &mdash;</option>
          {fields.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      {field && (
        <div className="btn-row">
          <button className="btn-primary" onClick={onNext}>Prosegui ai fattori &rarr;</button>
        </div>
      )}
    </div>
  )
}
