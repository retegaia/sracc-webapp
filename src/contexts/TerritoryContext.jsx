import { createContext, useContext } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useTerritorySelection } from '../hooks/useTerritorySelection.js'

const TerritoryContext = createContext(null)

// Montato una sola volta in AppLayout (stesso principio già usato per
// AppNav — "shared persistent nav via layout route"), invece di far
// chiamare GET /api/my-territories separatamente a ogni componente che ha
// bisogno del territorio attivo o del ruolo del chiamante su quel
// territorio (AppNav, Dashboard, CoordinatorView, AdminPanel...).
export function TerritoryProvider({ children }) {
  const { session } = useAuth()
  const value = useTerritorySelection(session)
  return <TerritoryContext.Provider value={value}>{children}</TerritoryContext.Provider>
}

// role/activeTerritoryId da qui sostituiscono profile.role/profile.territory_id
// (useAuth.js) ovunque servano per autorizzazione o per capire "su cosa sto
// operando adesso": in generale una persona può essere coordinator su un
// territorio e non su un altro, quindi il ruolo "globale" di users.role non
// basta più.
export function useActiveTerritory() {
  const ctx = useContext(TerritoryContext)
  if (!ctx) throw new Error('useActiveTerritory deve essere usato dentro TerritoryProvider')
  return ctx
}
