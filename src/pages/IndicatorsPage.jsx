import { useAuth } from '../hooks/useAuth.js'
import IndicatorSelector from '../components/IndicatorSelector.jsx'

// Route /indicatori (S11, §10.3): accessibile a contributor e coordinator
// senza redirect per ruolo, come /visualize/:type — non come /form o
// /coordinator, che invece rimandano indietro chi non ha il ruolo giusto.
// La disponibilità dei field (quali combinazioni un utente può scegliere
// indicatori per) è già filtrata dentro IndicatorSelector sui propri
// contributi validated, quindi qui serve solo la guardia di sessione.
export default function IndicatorsPage() {
  const { session, profile } = useAuth()

  if (session === undefined || profile === undefined) return <p>Caricamento&hellip;</p>
  if (!session) return <p>Non autenticato. Usa il link ricevuto via email.</p>
  if (!profile) return <p>Utente autenticato ma nessun profilo associato. Contatta il coordinatore.</p>

  return <IndicatorSelector />
}
