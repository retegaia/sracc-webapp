import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useActiveTerritory } from '../contexts/TerritoryContext.jsx'
import { roleHomeRoute } from '../lib/roleHome.js'
import '../styles/landing.css'

const STEPS = [
  ['1', 'Compilazione fattori', 'Il referente descrive esposizione, sensibilità e capacità adattiva per ogni combinazione sistema × pericolo di sua competenza.'],
  ['2', 'Pesatura indicatori', 'Una volta validata la Fase 1, si scelgono e pesano gli indicatori quantitativi/qualitativi per gli stessi field.'],
  ['3', 'Validazione del coordinatore', 'Il coordinatore rivede i contributi del territorio e valida le schede pronte, sbloccando la Fase 2.'],
  ['4', 'Visualizzazioni ed export', 'Bow-tie, Heatmap, grafo di pervasività e l’export delle catene d’impatto in Word/Excel per l’intero territorio.'],
]

// Route / (Tab.3): landing page mostrata sempre dopo il login, per
// utenti autenticati soltanto — non una route pubblica, vive comunque
// sotto AppLayout come le altre (v. App.jsx), che già garantisce sessione
// valida e territorio attivo risolto prima che questo componente
// renderizzi (AppLayout.jsx mostra TerritoryPicker al posto di Outlet
// finché lo stato non è 'ready' — quindi qui `role` non è mai null in
// pratica, a differenza di quanto ipotizzato nel prompt originale: non
// esiste un caso "più territori, nessuno scelto" da gestire dentro questo
// componente, è già intercettato a monte).
//
// Sostituisce il vecchio redirect automatico puro (role === 'coordinator'
// → /coordinator, altrimenti → /form) con un contenuto reale — il
// pulsante di scorciatoia sotto porta comunque alla stessa destinazione
// tramite roleHomeRoute (condivisa con la guardia in ContributorForm.jsx),
// per chi non vuole vedere la landing ogni volta.
export default function Dashboard() {
  const { profile } = useAuth()
  const { role } = useActiveTerritory()

  if (profile === undefined) return <p>Caricamento&hellip;</p>
  if (!profile) return <p>Utente autenticato ma nessun profilo associato. Contatta il coordinatore.</p>

  return (
    <div className="landing">
      <div className="landing-logo" aria-hidden="true">RADAPT</div>
      <h1>RADAPT</h1>
      <p className="landing-intro">
        Resilienza e adattamento: diagnosi, azioni, pianificazione e tracciamento del rischio climatico.
      </p>

      <Link className="landing-cta" to={roleHomeRoute(role)}>
        Vai alla tua area &rarr;
      </Link>

      <div className="landing-steps">
        {STEPS.map(([n, title, desc]) => (
          <div className="landing-step" key={n}>
            <div className="landing-step-n">{n}</div>
            <div>
              <div className="landing-step-t">{title}</div>
              <div className="landing-step-d">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <a className="landing-guide" href="/Guida_uso_piattaforma_SRACC.docx" download>
        &#8681; Scarica la guida d&rsquo;uso della piattaforma
      </a>
    </div>
  )
}
