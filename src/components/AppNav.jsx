import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useActiveTerritory } from '../contexts/TerritoryContext.jsx'
import '../styles/appNav.css'

const COORDINATOR_LINKS = [
  ['/form', 'Form'],
  ['/coordinator', 'Vista Coordinatore'],
  ['/visualize/bowtie', 'Visualizzazioni'],
  ['/indicatori', 'Indicatori'],
  ['/admin', 'Admin'],
]
const CONTRIBUTOR_LINKS = [
  ['/form', 'Form'],
  ['/visualize/bowtie', 'Visualizzazioni'],
  ['/indicatori', 'Indicatori'],
]
// L'osservatore non scrive mai (v. verifica ruolo osservatore, 2026-07-15)
// quindi non ha senso proporgli il link al form di compilazione — stesso
// redirect già applicato server-side in ContributorForm.jsx, qui si evita
// solo di mostrare il link a chi non dovrebbe cliccarci.
const OBSERVER_LINKS = [
  ['/visualize/bowtie', 'Visualizzazioni'],
  ['/indicatori', 'Indicatori'],
]

// Nav bar persistente, montata da AppLayout sopra tutte le route
// autenticate (tutto tranne /login). Risolve l'audit del 2026-07-10: ogni
// pagina era un'isola raggiungibile solo riscrivendo l'URL a mano o col
// tasto indietro del browser — nessun link tra /form, /coordinator,
// /admin, /visualize/*. Voci diverse per ruolo (Tab.3): il coordinator
// vede anche Vista Coordinatore e Admin; /visualize/:type è "Tutti" per
// specifica, quindi compare per tutti e tre i ruoli. L'osservatore non
// vede "Form" (v. OBSERVER_LINKS sopra, 2026-07-15). Non sostituisce le
// guardie di ruolo esistenti su /coordinator, /admin e /form (redirect se
// il ruolo non è quello giusto) — si limita a non proporre il link a chi
// non dovrebbe cliccarci; chi ci arriva comunque via URL diretto viene
// comunque rimandato indietro dal redirect di guardia del componente.
export default function AppNav() {
  const { profile } = useAuth()
  const { role, territories, clearSelection } = useActiveTerritory()
  const location = useLocation()

  if (!profile) return null

  const links = role === 'coordinator' ? COORDINATOR_LINKS : role === 'observer' ? OBSERVER_LINKS : CONTRIBUTOR_LINKS

  return (
    <nav className="app-nav">
      {links.map(([to, label]) => {
        const active = to === '/visualize/bowtie' ? location.pathname.startsWith('/visualize') : location.pathname === to
        return (
          <Link key={to} className={`app-nav-link${active ? ' on' : ''}`} to={to}>
            {label}
          </Link>
        )
      })}
      {territories.length > 1 && (
        <button className="app-nav-link app-nav-action" onClick={clearSelection}>
          Cambia territorio
        </button>
      )}
    </nav>
  )
}
