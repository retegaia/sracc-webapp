import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import StepSelector from '../components/StepSelector.jsx'
import FactorChips from '../components/FactorChips.jsx'
import WeightingPanel from '../components/WeightingPanel.jsx'
import NotesExport from '../components/NotesExport.jsx'
import IndicatorsBanner from '../components/IndicatorsBanner.jsx'
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
    setSelected([])
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
