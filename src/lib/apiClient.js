import { supabase } from './supabaseClient.js'
import { ACTIVE_TERRITORY_KEY } from './territoryStorage.js'

// Header X-Territory-Id aggiunto qui, in un solo punto, invece che in ogni
// chiamata: il territorio attivo scelto una volta per sessione (v.
// useTerritorySelection.js) va su ogni richiesta autenticata. Se non è
// ancora stato scelto (localStorage vuoto — caso di GET /api/my-territories
// prima della scelta, o POST /api/territories che non ne richiede uno)
// l'header è semplicemente assente: le Function che lo richiedono
// rispondono 400 in modo esplicito (v. resolveCaller in
// netlify/functions/_lib/auth.js), nessun default silenzioso.
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const territoryId = localStorage.getItem(ACTIVE_TERRITORY_KEY)
  if (territoryId) headers['X-Territory-Id'] = territoryId
  return headers
}

export async function apiGet(path) {
  const res = await fetch(`/api/${path}`, { headers: await authHeaders() })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || `GET /api/${path} fallita`)
  return body
}

export async function apiPost(path, payload) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || `POST /api/${path} fallita`)
  return body
}

// Scarica un file binario (export Word/Excel, S9) mantenendo l'header
// Authorization — un <a href> semplice non potrebbe portarlo, quindi si
// passa da fetch+blob e si simula il click su un <a> temporaneo con
// object URL, revocato subito dopo (stesso principio "niente residui" già
// seguito per le sessioni di test in questo progetto).
export async function apiDownload(path) {
  const res = await fetch(`/api/${path}`, { headers: await authHeaders() })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `GET /api/${path} fallita`)
  }
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match ? match[1] : 'export'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
