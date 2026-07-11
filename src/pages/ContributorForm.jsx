import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import StepSelector from '../components/StepSelector.jsx'
import FactorChips from '../components/FactorChips.jsx'
import WeightingPanel from '../components/WeightingPanel.jsx'
import NotesExport from '../components/NotesExport.jsx'
import IndicatorsBanner from '../components/IndicatorsBanner.jsx'
import { useOwnContribution } from '../hooks/useContributions.js'
import '../styles/contributorForm.css'

const STEPS = [
  ['1', 'Selezione'],
  ['2', 'Fattori'],
  ['3', 'Pesatura'],
  ['4', 'Note'],
]

// Route /form (Tab.3): i 4 passi guidati del referente. Contesto (sistema,
// pericolo, field, passo) persistito in query string per resistere a un
// refresh o essere condiviso (Tab.4, delta StepSelector).
export default function ContributorForm() {
  const [params, setParams] = useSearchParams()
  const step = Number(params.get('step') || '1')
  const sistema = params.get('sistema') || ''
  const pericolo = params.get('pericolo') || ''
  const field = params.get('field') || ''

  const [selected, setSelected] = useState([])
  const [note, setNote] = useState('')

  // Prefill (fix dell'11/07): quando sistema+pericolo+field sono tutti
  // selezionati, carica un'eventuale contribution già esistente dell'utente
  // per quella combinazione esatta. Non c'è un campo "vulnerability" da
  // prefillare a parte — NotesExport lo ricalcola sempre da selected via
  // computeVuln(selected) (v. WeightingPanel.jsx), quindi una volta
  // ripopolati factors+peso il giudizio di vulnerabilità torna coerente da
  // solo, nessun codice aggiuntivo necessario per quello specifico campo.
  const { contribution: existingContribution } = useOwnContribution(sistema, pericolo, field)

  useEffect(() => {
    if (existingContribution) {
      setSelected(existingContribution.factors)
      setNote(existingContribution.note ?? '')
    }
  }, [existingContribution])

  function goToStep(n) {
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('step', String(n))
      return next
    })
  }

  function setContext({ sistema, pericolo, field }) {
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('sistema', sistema)
      next.set('pericolo', pericolo)
      next.set('field', field)
      return next
    })
    // Reset a vuoto prima di un eventuale prefill (v. useEffect sopra) — se
    // la nuova combinazione non ha una contribution esistente, il form deve
    // restare vuoto e non trascinarsi selected/note della combinazione
    // precedente.
    setSelected([])
    setNote('')
  }

  return (
    <div className="contributor-form">
      {step === 1 && <IndicatorsBanner />}
      <div className="step-row">
        {STEPS.map(([n, label], i) => (
          <span key={n} style={{ display: 'contents' }}>
            <span className={`sd ${i + 1 < step ? 'done' : i + 1 === step ? 'active' : ''}`}>
              {i + 1 < step ? '✓' : n}
            </span>
            <span className="sl">{label}</span>
            {i < STEPS.length - 1 && <span className="ss">&rsaquo;</span>}
          </span>
        ))}
      </div>

      {existingContribution && step > 1 && (
        <div className="note-info">
          {existingContribution.status === 'validated'
            ? 'Stai modificando un contributo già validato dal coordinatore — le modifiche restano validate.'
            : 'Stai riprendendo un contributo già esistente per questa combinazione.'}
        </div>
      )}

      {step === 1 && (
        <StepSelector
          sistema={sistema}
          pericolo={pericolo}
          field={field}
          onChange={setContext}
          onNext={() => goToStep(2)}
        />
      )}
      {step === 2 && (
        <FactorChips
          sistema={sistema}
          pericolo={pericolo}
          field={field}
          selected={selected}
          onSelectedChange={setSelected}
          onBack={() => goToStep(1)}
          onNext={() => goToStep(3)}
        />
      )}
      {step === 3 && (
        <WeightingPanel
          selected={selected}
          onSelectedChange={setSelected}
          onBack={() => goToStep(2)}
          onNext={() => goToStep(4)}
        />
      )}
      {step === 4 && (
        <NotesExport
          sistema={sistema}
          pericolo={pericolo}
          field={field}
          selected={selected}
          note={note}
          onNoteChange={setNote}
          onBack={() => goToStep(3)}
        />
      )}
    </div>
  )
}
