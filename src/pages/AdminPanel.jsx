import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useActiveTerritory } from '../contexts/TerritoryContext.jsx'
import { useUsers, useRaci, useTerritory, useCombinazioniAttive } from '../hooks/useAdmin.js'
import UserManager from '../components/UserManager.jsx'
import RaciEditor from '../components/RaciEditor.jsx'
import TerritoryConfig from '../components/TerritoryConfig.jsx'
import CreateTerritory from '../components/CreateTerritory.jsx'
import ResetScheda from '../components/ResetScheda.jsx'
import CombinazioniManager from '../components/CombinazioniManager.jsx'
import '../styles/adminPanel.css'

const TABS = [
  ['utenti', 'Utenti'],
  ['raci', 'RACI'],
  ['combinazioni', 'Combinazioni'],
  ['territorio', 'Territorio'],
  ['reset', 'Resetta scheda'],
]

// Route /admin (Tab.3, S8): "Solo Coordinator — gestione utenti, RACI,
// configurazione territorio". Nessun prototipo di riferimento in docs/ per
// questo componente (assente anche da Tab.4) — struttura a tab per
// coerenza con CoordinatorView/Visualization, contenuti decisi da zero.
export default function AdminPanel() {
  const { session, profile } = useAuth()
  const { role } = useActiveTerritory()
  const { users, error: usersError, refetch: refetchUsers } = useUsers()
  const { raci, error: raciError, refetch: refetchRaci } = useRaci()
  const { territory, error: territoryError, refetch: refetchTerritory } = useTerritory()
  const { combinazioni, error: combinazioniError, refetch: refetchCombinazioni } = useCombinazioniAttive()
  const [tab, setTab] = useState('utenti')

  if (session === undefined || profile === undefined) return <p>Caricamento&hellip;</p>
  if (!session) return <p>Non autenticato. Usa il link ricevuto via email.</p>
  if (!profile) return <p>Utente autenticato ma nessun profilo associato. Contatta il coordinatore.</p>
  if (role !== 'coordinator') return <Navigate to="/form" replace />

  return (
    <div className="admin-panel">
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="main">
        {tab === 'utenti' && (
          <UserManager users={users} error={usersError} onCreated={refetchUsers} />
        )}
        {tab === 'raci' && <RaciEditor users={users} raci={raci} error={raciError} onChanged={refetchRaci} />}
        {tab === 'combinazioni' && (
          <CombinazioniManager combinazioni={combinazioni} error={combinazioniError} onChanged={refetchCombinazioni} />
        )}
        {tab === 'territorio' && (
          <>
            <TerritoryConfig territory={territory} error={territoryError} onSaved={refetchTerritory} />
            <CreateTerritory />
          </>
        )}
        {tab === 'reset' && <ResetScheda users={users} />}
      </div>
    </div>
  )
}
