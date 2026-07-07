// Helper condiviso da factors.js e contributions.js: client service-role e
// risoluzione del chiamante (id, role, territory_id) dal JWT Supabase.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function getServiceClient() {
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function getCallerUser(supabase, authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwt = authHeader.slice('Bearer '.length)
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data?.user) return null

  const { data: row, error: rowErr } = await supabase
    .from('users')
    .select('id, role, territory_id')
    .eq('id', data.user.id)
    .maybeSingle()
  if (rowErr || !row) return null
  return row
}
