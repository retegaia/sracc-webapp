import { supabase } from './supabaseClient.js'

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
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
