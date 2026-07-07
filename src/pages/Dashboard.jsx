import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

// Route / (Tab.3): redirect a /form o /coordinator secondo il ruolo.
export default function Dashboard() {
  const { session, profile } = useAuth()

  if (session === undefined || profile === undefined) return <p>Caricamento&hellip;</p>
  if (!session) return <p>Non autenticato. Usa il link ricevuto via email.</p>
  if (!profile) return <p>Utente autenticato ma nessun profilo associato. Contatta il coordinatore.</p>

  if (profile.role === 'coordinator') return <Navigate to="/coordinator" replace />
  return <Navigate to="/form" replace />
}
