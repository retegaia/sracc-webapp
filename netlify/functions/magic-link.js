// POST /api/magic-link — implementato in S2 (§3.1, §5.1)
// Solo il coordinatore può invitare un nuovo referente: crea (o recupera)
// l'utente Supabase Auth, allinea la riga in `users`, poi innesca l'invio
// del magic link tramite l'email integrata di Supabase Auth.
//
// Multi-territorio (2026-07-11): il territorio di destinazione dell'invito
// è il territorio ATTIVO del chiamante (header X-Territory-Id, risolto da
// resolveCaller — stesso meccanismo di tutte le altre Function), non più un
// campo territory_id nel body. L'autorizzazione richiede coordinator su
// QUEL territorio specifico, non un ruolo globale.
//
// Se l'email corrisponde a un utente già esistente (es. stesso team di un
// altro territorio, invitato anche qui — lo scenario reale dell'avvio di un
// secondo territorio), users.territory_id/role NON vengono sovrascritte:
// riflettono solo il primo territorio a cui è stato invitato e restano
// tali per compatibilità col bootstrap legacy. La riga di accesso vera per
// QUESTO territorio è sempre e solo in user_territories.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'
import { findAuthUserByEmail, sendMagicLink } from './_lib/authUsers.js'

const siteUrl = process.env.SITE_URL

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
  if (!siteUrl) return json({ error: 'server non configurato' }, 500)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller
  if (caller.role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { email, name, discipline, role: newRole } = body ?? {}
  if (!email || !name || !newRole) {
    return json({ error: 'email, name e role sono obbligatori' }, 400)
  }
  if (!['coordinator', 'contributor', 'observer'].includes(newRole)) {
    return json({ error: 'role non valido' }, 400)
  }

  const territoryId = caller.territory_id

  let userId
  let isNew
  try {
    ;({ id: userId, isNew } = await ensureAuthUser(supabase, email))
  } catch (err) {
    return json({ error: err.message }, 500)
  }

  const { data: existingRow, error: existingErr } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (existingErr) return json({ error: existingErr.message }, 500)

  if (existingRow) {
    const { error: updErr } = await supabase.from('users').update({ name, discipline }).eq('id', userId)
    if (updErr) return json({ error: updErr.message }, 500)
  } else {
    const { error: insErr } = await supabase
      .from('users')
      .insert({ id: userId, territory_id: territoryId, name, discipline, role: newRole })
    if (insErr) return json({ error: insErr.message }, 500)
  }

  const { error: utErr } = await supabase
    .from('user_territories')
    .upsert({ user_id: userId, territory_id: territoryId, role: newRole }, { onConflict: 'user_id,territory_id' })
  if (utErr) return json({ error: utErr.message }, 500)

  const { error: otpErr } = await sendMagicLink(supabase, email, siteUrl)
  if (otpErr) return json({ error: otpErr.message }, 500)

  return json({ ok: true, user_id: userId, is_new: isNew })
}
