import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useContributions } from '../hooks/useContributions.js'
import AggregatedView from '../components/AggregatedView.jsx'
import PervasivityView from '../components/PervasivityView.jsx'
import '../styles/coordinatorView.css'

const TABS = [
  ['aggregata', 'Vista aggregata'],
  ['pervasivita', 'Pervasività'],
  // Segnalazioni (SignalView) arriva in S5: dipende da /api/ai/overlaps (Tab.4/Tab.6).
]

// Route /coordinator (Tab.3), tab Aggregata e Pervasività (Tab.4/Tab.6, S4).
// Solo coordinator: chi non lo è viene rimandato a /form come in Dashboard.
export default function CoordinatorView() {
  const { session, profile } = useAuth()
  const { contributions, error } = useContributions()
  const [tab, setTab] = useState('aggregata')

  if (session === undefined || profile === undefined) return <p>Caricamento&hellip;</p>
  if (!session) return <p>Non autenticato. Usa il link ricevuto via email.</p>
  if (!profile) return <p>Utente autenticato ma nessun profilo associato. Contatta il coordinatore.</p>
  if (profile.role !== 'coordinator') return <Navigate to="/form" replace />

  return (
    <div className="coordinator-view">
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="main">
        {error && <p>Errore nel caricamento dei contributi: {error}</p>}
        {!error && contributions === undefined && <p>Caricamento contributi&hellip;</p>}
        {!error && contributions !== undefined && (
          <>
            {tab === 'aggregata' && <AggregatedView contributions={contributions} />}
            {tab === 'pervasivita' && <PervasivityView contributions={contributions} />}
          </>
        )}
      </div>
    </div>
  )
}
