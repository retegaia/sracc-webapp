import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/apiClient.js'

// Libreria indicatori per un field specifico (S11, §10.4) — usato da
// IndicatorSelector, stesso pattern di useFieldFactors in useFactors.js.
export function useFieldIndicatori(sistema, pericolo, field) {
  const [indicatori, setIndicatori] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!sistema || !pericolo || !field) {
      setIndicatori(undefined)
      return
    }
    let active = true
    setIndicatori(undefined)
    const params = new URLSearchParams({ sistema, pericolo, field })
    apiGet(`indicatori?${params}`)
      .then(({ indicatori }) => active && setIndicatori(indicatori))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [sistema, pericolo, field])

  return { indicatori, error }
}

// Selezioni indicatori già salvate per sistema×pericolo (tutti i field di
// quella tavola) — usato da IndicatorSelector per precompilare lo stato di
// un field appena aperto senza una chiamata per ogni combinazione.
// refetch (aggiunto per il reset scheda, stesso motivo/meccanismo di
// useOwnContribution in useContributions.js) usa un contatore di "epoca"
// per restare protetto da risposte fuori ordine tra l'effect e le chiamate
// manuali.
export function useIndicatoriScelti(sistema, pericolo) {
  const [indicatoriScelti, setIndicatoriScelti] = useState(undefined)
  const [error, setError] = useState(null)
  const epochRef = useRef(0)

  const load = useCallback(() => {
    const epoch = ++epochRef.current
    if (!sistema || !pericolo) {
      setIndicatoriScelti(undefined)
      return
    }
    setIndicatoriScelti(undefined)
    const params = new URLSearchParams({ sistema, pericolo })
    apiGet(`indicatori-scelti?${params}`)
      .then(({ indicatori_scelti }) => {
        if (epochRef.current === epoch) setIndicatoriScelti(indicatori_scelti)
      })
      .catch((err) => {
        if (epochRef.current === epoch) setError(err.message)
      })
  }, [sistema, pericolo])

  useEffect(() => {
    load()
  }, [load])

  return { indicatoriScelti, error, refetch: load }
}

// Tutte le indicatori_scelti visibili al chiamante, nessun filtro
// sistema/pericolo — usato dalla vista d'insieme "Indicatori"
// (IndicatoriOverview.jsx, 2026-07-16). Stessa visibilità di
// useIndicatoriScelti (contributor: solo le proprie righe; coordinator/
// observer: tutto il territorio), stesso pattern di useContributions.
export function useAllIndicatoriScelti() {
  const [indicatoriScelti, setIndicatoriScelti] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    apiGet('indicatori-scelti')
      .then(({ indicatori_scelti }) => active && setIndicatoriScelti(indicatori_scelti))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  return { indicatoriScelti, error }
}
