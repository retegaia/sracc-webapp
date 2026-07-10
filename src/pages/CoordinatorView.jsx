import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useContributions } from '../hooks/useContributions.js'
import AggregatedView from '../components/AggregatedView.jsx'
import PervasivityView from '../components/PervasivityView.jsx'
import SignalView from '../components/SignalView.jsx'
import '../styles/coordinatorView.css'

const TABS = [
  ['aggregata', 'Vista aggregata'],
  ['pervasivita', 'Pervasività'],
  ['segnalazioni', 'Segnalazioni'],
]

// Route /coordinator (Tab.3), tab Aggregata, Pervasività e Segnalazioni
// (Tab.4/Tab.6, S4/S5). Il tab Segnalazioni monta SignalView solo quando
// selezionato (v. sotto), il che è anche ciò che rende lazy la chiamata a
// /api/ai/overlaps richiesta dal §6.2 — nessun flag aggiuntivo necessario.
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
        <Link className="tab" to="/admin" style={{ marginLeft: 'auto' }}>
          Admin
        </Link>
      </div>
      <div className="main">
        {error && <p>Errore nel caricamento dei contributi: {error}</p>}
        {!error && contributions === undefined && <p>Caricamento contributi&hellip;</p>}
        {!error && contributions !== undefined && (
          <>
            {tab === 'aggregata' && <AggregatedView contributions={contributions} />}
            {tab === 'pervasivita' && <PervasivityView contributions={contributions} />}
            {tab === 'segnalazioni' && <SignalView contributions={contributions} />}
          </>
        )}
      </div>
    </div>
  )
}
