import { computeVuln } from '../components/WeightingPanel.jsx'

// Payload condiviso tra il salvataggio bozza (ContributorForm, agli
// avanzamenti di step) e l'invio finale (NotesExport) — stessa forma per
// entrambi, solo `status` cambia.
export function buildContributionPayload({ sistema, pericolo, field, selected, note, status }) {
  return {
    sistema,
    pericolo,
    field,
    factors: selected,
    vulnerability: computeVuln(selected),
    note,
    status,
  }
}
