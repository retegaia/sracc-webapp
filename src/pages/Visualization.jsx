import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useContributions } from '../hooks/useContributions.js'
import BowTie from '../components/BowTie.jsx'
import HeatMap from '../components/HeatMap.jsx'
import '../styles/visualization.css'

const TYPES = [
  ['bowtie', 'Bow-tie'],
  ['heatmap', 'Heatmap'],
]

// Route /visualize/:type (Tab.3, S6): accessibile a tutti i ruoli
// autenticati, a differenza di /coordinator. :type distingue bowtie e
// heatmap; il terzo tipo (grafo pervasività) è S7 — bloccato dalla
// questione aperta B2 (§11, Tab.9) — non è nella nav di questa pagina, ma
// un link diretto a /visualize/grafo mostra un placeholder invece di un 404.
// Query param sistema/pericolo/field (Tab.3) filtrano il bow-tie sulla
// combinazione indicata.
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
            {type !== 'bowtie' && type !== 'heatmap' && (
              <div className="empty">
                Visualizzazione &ldquo;{type}&rdquo; non ancora disponibile.
                {type === 'grafo' && ' Il grafo pervasività arriva in una sessione successiva.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
