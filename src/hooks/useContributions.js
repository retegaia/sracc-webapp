import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../lib/apiClient.js'

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
