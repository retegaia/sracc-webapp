import { useEffect, useState } from 'react'
import { apiGet } from '../lib/apiClient.js'

// Tutti i contributi visibili al chiamante (§3.1: coordinator vede l'intero
// territorio, contributor solo i propri) — usato da CoordinatorView per
// alimentare AggregatedView e PervasivityView con una sola chiamata,
// invece di una richiesta per combinazione sistema×pericolo.
export function useContributions() {
  const [contributions, setContributions] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    apiGet('contributions')
      .then(({ contributions }) => active && setContributions(contributions))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  return { contributions, error }
}
