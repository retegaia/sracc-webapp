import { useEffect, useState } from 'react'
import { apiGet } from '../lib/apiClient.js'

// Righe {sistema, pericolo, field, ...} -> albero sistema → pericolo →
// [field,...], stessa forma per useFactorTaxonomy e useActiveTaxonomy
// (le uniche due differenze tra i due hook sono l'endpoint chiamato e la
// chiave della risposta).
function buildTaxonomyTree(rows) {
  const tree = {}
  for (const r of rows) {
    tree[r.sistema] ??= {}
    tree[r.sistema][r.pericolo] ??= new Set()
    tree[r.sistema][r.pericolo].add(r.field)
  }
  for (const pericoli of Object.values(tree)) {
    for (const [pericolo, fields] of Object.entries(pericoli)) {
      pericoli[pericolo] = [...fields]
    }
  }
  return tree
}

// Intera libreria condivisa visibile al territorio (GET /api/factors, mai
// filtrata per combinazione attiva) — usato da HeatMap.jsx e
// ResetScheda.jsx, che devono restare raggiungibili anche su combinazioni
// o dati storici non più "attivi" (v. useActiveTaxonomy sotto per la
// tassonomia filtrata usata invece da StepSelector/RaciEditor).
export function useFactorTaxonomy() {
  const [tree, setTree] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    apiGet('factors')
      .then(({ factors }) => active && setTree(buildTaxonomyTree(factors)))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  return { tree, error }
}

// Tassonomia ATTIVA per il territorio del chiamante (2026-07-16, tabella
// combinazioni_attive, GET /api/combinazioni-attive) — a differenza di
// useFactorTaxonomy sopra (libreria condivisa factors, sempre completa),
// questa è la fonte per StepSelector (form di compilazione) e RaciEditor
// (assegnazione referente): un territorio senza combinazioni attive vede
// un albero vuoto, comportamento voluto (es. Comune di Sinnai finché non
// parte il suo lavoro metodologico proprio). Deliberatamente NON usata da
// HeatMap/ResetScheda: quelle viste mostrano/gestiscono dati già esistenti
// a prescindere da cosa sia oggi "attivo", filtrarle allo stesso modo
// avrebbe nascosto contributi/RACI reali già presenti su un territorio
// (es. Sinnai) o reso "Resetta scheda" incapace di raggiungerli.
export function useActiveTaxonomy() {
  const [tree, setTree] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    apiGet('combinazioni-attive')
      .then(({ combinazioni }) => active && setTree(buildTaxonomyTree(combinazioni)))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  return { tree, error }
}

// Fattori di libreria per un field specifico — usato da FactorChips.
export function useFieldFactors(sistema, pericolo, field) {
  const [factors, setFactors] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!sistema || !pericolo || !field) {
      setFactors(undefined)
      return
    }
    let active = true
    setFactors(undefined)
    const params = new URLSearchParams({ sistema, pericolo, field })
    apiGet(`factors?${params}`)
      .then(({ factors }) => active && setFactors(factors))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [sistema, pericolo, field])

  return { factors, error }
}
