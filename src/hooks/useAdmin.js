import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../lib/apiClient.js'

// Utenti del territorio (S8, AdminPanel) — a differenza degli altri hook
// GET-on-mount di questo repo, espone refetch: dopo un invito
// (/api/magic-link) o un'assegnazione RACI la UI deve poter ricaricare le
// liste senza un reload di pagina.
export function useUsers() {
  const [users, setUsers] = useState(undefined)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    apiGet('users')
      .then(({ users }) => setUsers(users))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { users, error, refetch }
}

// Matrice RACI del territorio (S8, AdminPanel).
export function useRaci() {
  const [raci, setRaci] = useState(undefined)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    apiGet('raci')
      .then(({ raci }) => setRaci(raci))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { raci, error, refetch }
}

// Combinazioni attive del territorio (2026-07-16, AdminPanel — tab
// "Combinazioni"). Stesso GET /api/combinazioni-attive già usato da
// useActiveTaxonomy() (useFactors.js), ma qui la risposta grezza serve
// così com'è (per incrociarla con la tassonomia completa e capire quali
// singole combinazioni sono già attive), non aggregata in un albero.
export function useCombinazioniAttive() {
  const [combinazioni, setCombinazioni] = useState(undefined)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    apiGet('combinazioni-attive')
      .then(({ combinazioni }) => setCombinazioni(combinazioni))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { combinazioni, error, refetch }
}

// Territorio del chiamante (S8, AdminPanel — solo name/region).
export function useTerritory() {
  const [territory, setTerritory] = useState(undefined)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    apiGet('territory')
      .then(({ territory }) => setTerritory(territory))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { territory, error, refetch }
}
