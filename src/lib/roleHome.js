// Route "di casa" per ruolo — unico punto che decide dove porta il
// pulsante di scorciatoia della landing (Dashboard.jsx): stessa
// destinazione già usata dal redirect automatico di Dashboard prima
// dell'introduzione della landing (coordinator → /coordinator) più il
// caso observer (→ /visualize/bowtie, aggiunto con la guardia su /form
// del 2026-07-15) — estratta qui per non duplicarla tra la landing e le
// guardie di route esistenti (ContributorForm.jsx, CoordinatorView.jsx).
export function roleHomeRoute(role) {
  if (role === 'coordinator') return '/coordinator'
  if (role === 'observer') return '/visualize/bowtie'
  return '/form'
}
