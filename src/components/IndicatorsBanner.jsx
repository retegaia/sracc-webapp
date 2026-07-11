import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { apiGet } from '../lib/apiClient.js'

// Banner opzionale (§10.4: "la Dashboard si aggiorna per instradare verso
// /indicatori quando disponibile") — agganciato al Form referente invece
// che a Dashboard.jsx, che è un puro redirect (session === session, poi
// <Navigate>) e non ha un corpo su cui montare un banner. Mostrato solo
// quando l'utente ha almeno un field validated senza ancora una riga in
// indicatori-scelti propria. Un errore qui non deve mai bloccare il form:
// nessun setError propagato, solo count=0 (banner nascosto) in caso di
// fallimento.
export default function IndicatorsBanner() {
  const { profile } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!profile) return
    let active = true
    Promise.all([apiGet('contributions'), apiGet('indicatori-scelti')])
      .then(([{ contributions }, { indicatori_scelti }]) => {
        if (!active) return
        const validated = contributions.filter((c) => c.user_id === profile.id && c.status === 'validated')
        const chosenKeys = new Set(
          indicatori_scelti
            .filter((r) => r.user_id === profile.id)
            .map((r) => `${r.sistema}||${r.pericolo}||${r.field}`)
        )
        const pending = validated.filter((c) => !chosenKeys.has(`${c.sistema}||${c.pericolo}||${c.field}`))
        setCount(pending.length)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [profile])

  if (!count) return null

  return (
    <div className="card" style={{ borderColor: 'var(--ga)' }}>
      <div className="ct">Fase 2 disponibile</div>
      <p style={{ fontSize: 13, marginBottom: 10 }}>
        Hai {count} field validat{count > 1 ? 'i' : 'o'} pront{count > 1 ? 'i' : 'o'} per la pesatura degli indicatori.
      </p>
      <Link className="btn-primary" to="/indicatori">
        Vai a Indicatori &rarr;
      </Link>
    </div>
  )
}
