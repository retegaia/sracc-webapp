import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
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

// Nav bar persistente, montata da AppLayout sopra tutte le route
// autenticate (tutto tranne /login). Risolve l'audit del 2026-07-10: ogni
// pagina era un'isola raggiungibile solo riscrivendo l'URL a mano o col
// tasto indietro del browser — nessun link tra /form, /coordinator,
// /admin, /visualize/*. Voci diverse per ruolo (Tab.3): il coordinator
// vede anche Vista Coordinatore e Admin; /visualize/:type è "Tutti" per
// specifica, quindi compare per entrambi i ruoli. Non sostituisce le
// guardie di ruolo esistenti su /coordinator e /admin (redirect a /form
// se non coordinator) — si limita a non proporre il link a chi non
// dovrebbe cliccarci; chi ci arriva comunque via URL diretto viene
// comunque rimandato indietro dal redirect di guardia del componente.
export default function AppNav() {
  const { profile } = useAuth()
  const location = useLocation()

  if (!profile) return null

  const links = profile.role === 'coordinator' ? COORDINATOR_LINKS : CONTRIBUTOR_LINKS

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
    </nav>
  )
}
