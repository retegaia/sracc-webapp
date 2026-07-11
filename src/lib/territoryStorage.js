// Chiave localStorage condivisa tra apiClient.js (header X-Territory-Id) e
// useTerritorySelection.js (lettura/scrittura della scelta) — un solo punto
// di verità per il nome della chiave, per non doverli tenere sincronizzati
// a mano in due file.
export const ACTIVE_TERRITORY_KEY = 'sracc_active_territory_id'
