import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useContributions } from '../hooks/useContributions.js'
import BowTie from '../components/BowTie.jsx'
import HeatMap from '../components/HeatMap.jsx'
import PervasityGraph from '../components/PervasityGraph.jsx'
import '../styles/visualization.css'

const TYPES = [
  ['bowtie', 'Bow-tie'],
  ['heatmap', 'Heatmap'],
  ['grafo', 'Grafo pervasività'],
]

// Route /visualize/:type (Tab.3, S6/S7): accessibile a tutti i ruoli
// autenticati, a differenza di /coordinator. :type distingue bowtie,
// heatmap e grafo (pervasività, S7 — l'encoding dell'intensità che
// chiudeva la questione aperta B2, §11 Tab.9, è stato deciso il
// 2026-07-10). Query param sistema/pericolo/field (Tab.3) filtrano il
// bow-tie sulla combinazione indicata.
export default function Visualization() {
  const { type } = useParams()
  const [params] = useSearchParams()
  const { session, profile } = useAuth()
  const { contributions, error } = useContributions()

  if (session === undefined || profile === undefined) return <p>Caricamento&hellip;</p>
  if (!session) return <p>Non autenticato. Usa il link ricevuto via email.</p>
  if (!profile) return <p>Utente autenticato ma nessun profilo associato. Contatta il coordinatore.</p>

  const sistema = params.get('sistema') || ''
  const pericolo = params.get('pericolo') || ''
  const field = params.get('field') || ''
  const qs = params.toString()

  return (
    <div className="visualization">
      <div className="tabs">
        {TYPES.map(([id, label]) => (
          <Link key={id} className={`tab${type === id ? ' on' : ''}`} to={`/visualize/${id}${qs ? `?${qs}` : ''}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="main">
        {error && <p>Errore nel caricamento dei contributi: {error}</p>}
        {!error && contributions === undefined && <p>Caricamento contributi&hellip;</p>}
        {!error && contributions !== undefined && (
          <>
            {type === 'bowtie' && (
              <BowTie contributions={contributions} sistema={sistema} pericolo={pericolo} field={field} />
            )}
            {type === 'heatmap' && <HeatMap contributions={contributions} />}
            {type === 'grafo' && <PervasityGraph contributions={contributions} />}
            {type !== 'bowtie' && type !== 'heatmap' && type !== 'grafo' && (
              <div className="empty">Visualizzazione &ldquo;{type}&rdquo; non disponibile.</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
