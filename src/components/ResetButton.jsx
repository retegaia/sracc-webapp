import { useState } from 'react'
import { apiPost } from '../lib/apiClient.js'

// Conferma a due passi inline invece di window.confirm nativo — nessun
// componente in questo repo usa dialog nativi (bloccano l'automazione
// browser usata per verificare le feature end-to-end, v. memoria di
// progetto), e resta coerente con lo stile a card/bottoni già usato
// ovunque. "Nessun annulla" nel senso del reset stesso (irreversibile una
// volta confermato), non del passo di conferma — quello si può annullare.
//
// Condiviso da ContributorForm, IndicatorSelector, AggregatedView e
// ResetScheda (admin) — stessa chiamata POST /api/<kind>/reset, stesso
// stile "azione distruttiva" (rosso pieno, non l'outline usato per gli
// errori altrove) per restare visivamente distinto da Salva/Invia/Valida
// (verdi, .btn-primary) in tutti e quattro i punti in cui compare — usare
// sempre questo componente condiviso, mai ricostruire lo stile a mano.
export default function ResetButton({ kind, sistema, pericolo, field, user_id, label = 'Resetta questa scheda', onReset }) {
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState('idle') // idle | resetting | error
  const [errorMsg, setErrorMsg] = useState('')

  const dangerStyle = {
    background: 'var(--sf)',
    color: '#fff',
    borderColor: 'var(--sf)',
  }

  async function doReset() {
    setStatus('resetting')
    setErrorMsg('')
    try {
      const result = await apiPost(`${kind}/reset`, { sistema, pericolo, field, user_id })
      setConfirming(false)
      setStatus('idle')
      onReset?.(result)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  if (!confirming) {
    return (
      <button type="button" style={dangerStyle} onClick={() => setConfirming(true)}>
        {label}
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--sf)' }}>Sicuro? Non è possibile annullare dopo il reset.</span>
      <button type="button" style={dangerStyle} disabled={status === 'resetting'} onClick={doReset}>
        {status === 'resetting' ? 'Reset…' : 'Sì, resetta'}
      </button>
      <button type="button" disabled={status === 'resetting'} onClick={() => setConfirming(false)}>
        Annulla
      </button>
      {status === 'error' && <span style={{ fontSize: 12, color: 'var(--sf)' }}>Errore: {errorMsg}</span>}
    </span>
  )
}
