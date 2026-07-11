import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useActiveTerritory } from '../contexts/TerritoryContext.jsx'

// Route / (Tab.3): redirect a /form o /coordinator secondo il ruolo.
// Multi-territorio (2026-07-11): il ruolo che conta è quello sul territorio
// ATTIVO (TerritoryContext), non profile.role — una persona può essere
// coordinator su un territorio e non su un altro.
export default function Dashboard() {
  const { session, profile } = useAuth()
  const { role } = useActiveTerritory()

  if (session === undefined || profile === undefined) return <p>Caricamento&hellip;</p>
  if (!session) return <p>Non autenticato. Usa il link ricevuto via email.</p>
  if (!profile) return <p>Utente autenticato ma nessun profilo associato. Contatta il coordinatore.</p>

  if (role === 'coordinator') return <Navigate to="/coordinator" replace />
  return <Navigate to="/form" replace />
}
