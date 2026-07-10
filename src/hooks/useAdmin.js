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
