import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { TerritoryProvider, useActiveTerritory } from '../contexts/TerritoryContext.jsx'
import AppNav from './AppNav.jsx'
import TerritoryPicker from './TerritoryPicker.jsx'

function AppLayoutInner() {
  const { session } = useAuth()
  const { status, territories, error, selectTerritory } = useActiveTerritory()

  // Nessuna sessione (in caricamento o non autenticato): la guardia sul
  // territorio non ha senso qui — si lascia che ogni pagina mostri il
  // proprio stato, stesso comportamento di prima di questa modifica.
  if (session === undefined || session === null) {
    return (
      <>
        <AppNav />
        <Outlet />
      </>
    )
  }

  if (status === 'idle' || status === 'loading') return <p>Caricamento&hellip;</p>
  if (status === 'error') return <p>Errore nel caricamento dei territori: {error}</p>
  if (status === 'no-territories') {
    return <p>Nessun territorio associato al tuo utente. Contatta il coordinatore.</p>
  }
  if (status === 'needs-selection') {
    return <TerritoryPicker territories={territories} onSelect={selectTerritory} />
  }

  return (
    <>
      <AppNav />
      <Outlet />
    </>
  )
}

// Layout condiviso da tutte le route autenticate (App.jsx) — monta AppNav
// una sola volta sopra l'Outlet, invece di ripeterlo in ogni pagina.
//
// Multi-territorio (2026-07-11): monta anche TerritoryProvider e agisce da
// guardia unica per la scelta del territorio attivo — se la sessione è
// valida ma non c'è ancora un territorio scelto per questa sessione (o la
// scelta salvata non è più valida), mostra la schermata di scelta invece
// di Outlet, così le altre chiamate API non falliscono per mancanza
// dell'header X-Territory-Id.
export default function AppLayout() {
  return (
    <TerritoryProvider>
      <AppLayoutInner />
    </TerritoryProvider>
  )
}
