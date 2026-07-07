import { useEffect, useState } from 'react'
import { apiGet } from '../lib/apiClient.js'

// Intera libreria visibile al territorio, raggruppata in un albero
// sistema → pericolo → [field,...] — usato da StepSelector per le tendine
// a cascata (sostituisce l'oggetto L embedded del prototipo).
export function useFactorTaxonomy() {
  const [tree, setTree] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    apiGet('factors')
      .then(({ factors }) => {
        if (!active) return
        const tree = {}
        for (const f of factors) {
          tree[f.sistema] ??= {}
          tree[f.sistema][f.pericolo] ??= new Set()
          tree[f.sistema][f.pericolo].add(f.field)
        }
        for (const pericoli of Object.values(tree)) {
          for (const [pericolo, fields] of Object.entries(pericoli)) {
            pericoli[pericolo] = [...fields]
          }
        }
        setTree(tree)
      })
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
