// POST /api/magic-link — implementato in S2 (§3.1, §5.1)
// Solo il coordinatore può invitare un nuovo referente: crea (o recupera)
// l'utente Supabase Auth, allinea la riga in `users`, poi innesca l'invio
// del magic link tramite l'email integrata di Supabase Auth.
import { createClient } from '@supabase/supabase-js'
import { findAuthUserByEmail, sendMagicLink } from './_lib/authUsers.js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const siteUrl = process.env.SITE_URL

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function getCallerRole(supabase, authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwt = authHeader.slice('Bearer '.length)
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data?.user) return null

  const { data: row, error: rowErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()
  if (rowErr || !row) return null
  return row.role
}

async function ensureAuthUser(supabase, email) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (!createErr) return { id: created.user.id, isNew: true }

  const alreadyExists = createErr.code === 'email_exists' || /already/i.test(createErr.message)
  if (!alreadyExists) throw createErr

  const found = await findAuthUserByEmail(supabase, email)
  if (found) return { id: found.id, isNew: false }
  throw new Error(`Utente auth non trovato per email ${email} dopo creazione fallita.`)
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!supabaseUrl || !serviceKey || !siteUrl) return json({ error: 'server non configurato' }, 500)

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const role = await getCallerRole(supabase, req.headers.get('authorization'))
  if (role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { email, name, discipline, role: newRole, territory_id } = body ?? {}
  if (!email || !name || !newRole || !territory_id) {
    return json({ error: 'email, name, role e territory_id sono obbligatori' }, 400)
  }
  if (!['coordinator', 'contributor', 'observer'].includes(newRole)) {
    return json({ error: 'role non valido' }, 400)
  }

  let userId
  let isNew
  try {
    ;({ id: userId, isNew } = await ensureAuthUser(supabase, email))
  } catch (err) {
    return json({ error: err.message }, 500)
  }

  const { error: upsertErr } = await supabase
    .from('users')
    .upsert({ id: userId, territory_id, name, discipline, role: newRole }, { onConflict: 'id' })
  if (upsertErr) return json({ error: upsertErr.message }, 500)

  const { error: otpErr } = await sendMagicLink(supabase, email, siteUrl)
  if (otpErr) return json({ error: otpErr.message }, 500)

  return json({ ok: true, user_id: userId, is_new: isNew })
}
