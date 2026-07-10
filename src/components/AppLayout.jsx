import { Outlet } from 'react-router-dom'
import AppNav from './AppNav.jsx'

// Layout condiviso da tutte le route autenticate (App.jsx) — monta AppNav
// una sola volta sopra l'Outlet, invece di ripeterlo in ogni pagina.
export default function AppLayout() {
  return (
    <>
      <AppNav />
      <Outlet />
    </>
  )
}
