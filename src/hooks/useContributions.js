import { useCallback, useEffect, useState } from 'react'
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
export function useOwnContribution(sistema, pericolo, field) {
  const { profile } = useAuth()
  const [contribution, setContribution] = useState(undefined) // undefined=loading, null=nessuna, altrimenti la riga
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!sistema || !pericolo || !field || !profile) {
      setContribution(undefined)
      return
    }
    let active = true
    setContribution(undefined)
    const params = new URLSearchParams({ sistema, pericolo, field })
    apiGet(`contributions?${params}`)
      .then(({ contributions }) => {
        if (!active) return
        setContribution(contributions.find((c) => c.user_id === profile.id) ?? null)
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [sistema, pericolo, field, profile])

  return { contribution, error }
}
