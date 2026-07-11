import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../lib/apiClient.js'
import { ACTIVE_TERRITORY_KEY } from '../lib/territoryStorage.js'

// Risolve il territorio "attivo" per la sessione corrente (multi-territorio,
// 2026-07-11): dopo il login la scelta del territorio va fatta una volta
// sola (non un selettore persistente in nav bar, per non rischiare stato
// disallineato — decisione con Andrea Vallebona) e salvata in localStorage
// così sopravvive alla chiusura del browser. Se c'è una sessione valida ma
// nessuna scelta salvata (o la scelta salvata non è più tra i territori
// disponibili, es. accesso revocato) lo stato torna a needs-selection senza
// richiedere un nuovo magic link — v. AppLayout.jsx per la guardia che
// intercetta questo stato.
export function useTerritorySelection(session) {
  const [status, setStatus] = useState('idle') // idle | loading | needs-selection | no-territories | ready | error
  const [territories, setTerritories] = useState([])
  const [activeTerritoryId, setActiveTerritoryId] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const { territories: list } = await apiGet('my-territories')
      setTerritories(list)
      if (list.length === 0) {
        setActiveTerritoryId(null)
        setStatus('no-territories')
        return
      }
      const saved = localStorage.getItem(ACTIVE_TERRITORY_KEY)
      const savedStillValid = saved && list.some((t) => t.territory_id === saved)
      if (savedStillValid) {
        setActiveTerritoryId(saved)
        setStatus('ready')
      } else if (list.length === 1) {
        // Un solo territorio disponibile: nessun attrito aggiunto, si entra
        // come prima di questa modifica.
        localStorage.setItem(ACTIVE_TERRITORY_KEY, list[0].territory_id)
        setActiveTerritoryId(list[0].territory_id)
        setStatus('ready')
      } else {
        setActiveTerritoryId(null)
        setStatus('needs-selection')
      }
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (session === null) {
      setStatus('idle')
      setTerritories([])
      setActiveTerritoryId(null)
      return
    }
    load()
  }, [session, load])

  function selectTerritory(territoryId) {
    localStorage.setItem(ACTIVE_TERRITORY_KEY, territoryId)
    setActiveTerritoryId(territoryId)
    setStatus('ready')
  }

  // Azione deliberata dietro il link "Cambia territorio" (AppNav) — non un
  // selettore sempre visibile: cancella la scelta salvata e riporta alla
  // schermata di scelta, stessa via di needs-selection.
  function clearSelection() {
    localStorage.removeItem(ACTIVE_TERRITORY_KEY)
    setActiveTerritoryId(null)
    setStatus('needs-selection')
  }

  const active = territories.find((t) => t.territory_id === activeTerritoryId)

  return {
    status,
    territories,
    activeTerritoryId,
    role: active?.role ?? null,
    error,
    selectTerritory,
    clearSelection,
    refetch: load,
  }
}
