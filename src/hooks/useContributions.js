import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/apiClient.js'
import { useAuth } from './useAuth.js'

// Tutti i contributi visibili al chiamante (§3.1: coordinator vede l'intero
// territorio, contributor solo i propri) — usato da CoordinatorView per
// alimentare AggregatedView e PervasivityView con una sola chiamata,
// invece di una richiesta per combinazione sistema×pericolo.
// refetch esposto dalla S10 (bottone "Valida" in AggregatedView, v.
// useUsers/useRaci in useAdmin.js per lo stesso pattern) per ricaricare gli
// status dopo una validazione senza un reload di pagina.
export function useContributions() {
  const [contributions, setContributions] = useState(undefined)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    apiGet('contributions')
      .then(({ contributions }) => setContributions(contributions))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { contributions, error, refetch }
}

// Contribution del chiamante per una combinazione esatta — usato da
// ContributorForm per il prefill (fix del gap trovato l'11/07: il form non
// caricava mai un contributo esistente, mostrando FactorChips vuoto anche
// su field già migrati e validated). GET /api/contributions?sistema=&
// pericolo=&field= per un contributor restituisce già solo le proprie righe
// (filtro server-side), ma per un coordinator restituisce l'intero
// territorio su quel field — isoliamo comunque la riga di user_id ===
// profile.id, stesso pattern già usato in IndicatorSelector.jsx per
// ownExisting/GET /api/indicatori-scelti.
// refetch (aggiunto per il reset scheda) usa un contatore di "epoca" invece
// del flag active+cleanup della versione precedente: un useEffect non può
// invalidare una richiesta lanciata da una chiamata manuale a refetch() (e
// viceversa), quindi entrambi i percorsi devono condividere lo stesso
// meccanismo di invalidazione per restare protetti da risposte fuori
// ordine (field cambiato due volte di fretta, o refetch chiamato mentre un
// fetch dell'effect è ancora in volo).
export function useOwnContribution(sistema, pericolo, field) {
  const { profile } = useAuth()
  const [contribution, setContribution] = useState(undefined) // undefined=loading, null=nessuna, altrimenti la riga
  const [error, setError] = useState(null)
  const epochRef = useRef(0)

  const load = useCallback(() => {
    const epoch = ++epochRef.current
    if (!sistema || !pericolo || !field || !profile) {
      setContribution(undefined)
      return
    }
    setContribution(undefined)
    const params = new URLSearchParams({ sistema, pericolo, field })
    apiGet(`contributions?${params}`)
      .then(({ contributions }) => {
        if (epochRef.current !== epoch) return
        setContribution(contributions.find((c) => c.user_id === profile.id) ?? null)
      })
      .catch((err) => {
        if (epochRef.current === epoch) setError(err.message)
      })
  }, [sistema, pericolo, field, profile])

  useEffect(() => {
    load()
  }, [load])

  return { contribution, error, refetch: load }
}
