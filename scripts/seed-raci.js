// Import di territorio, referenti e matrice RACI da data/raci-seed.json
// (§7.1, §8.1). Al primo inserimento di un referente invia anche il suo
// primo magic link: è il bootstrap, perché prima che esista un coordinatore
// con sessione attiva non c'è nessuno che possa chiamare POST /api/magic-link.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '../data/raci-seed.json')

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const siteUrl = process.env.SITE_URL
if (!supabaseUrl || !serviceKey || !siteUrl) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_KEY e SITE_URL richieste (vedi .env.example).')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function ensureTerritory({ name, region }) {
  const { data: existing, error: selErr } = await supabase
    .from('territories')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (selErr) throw selErr
  if (existing) return existing.id

  const { data: created, error: insErr } = await supabase
    .from('territories')
    .insert({ name, region })
    .select('id')
    .single()
  if (insErr) throw insErr
  return created.id
}

async function ensureAuthUser(email) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (!createErr) return { id: created.user.id, isNew: true }

  const alreadyExists = createErr.code === 'email_exists' || /already/i.test(createErr.message)
  if (!alreadyExists) throw createErr

  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return { id: found.id, isNew: false }
    if (data.users.length < 200) break
    page += 1
  }
  throw new Error(`Utente auth non trovato per email ${email} dopo creazione fallita.`)
}

async function ensureUserRow({ id, territory_id, name, discipline, role }) {
  const { error } = await supabase
    .from('users')
    .upsert({ id, territory_id, name, discipline, role }, { onConflict: 'id' })
  if (error) throw error
}

async function main() {
  const seed = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))

  const territoryId = await ensureTerritory(seed.territory)
  console.log(`Territorio "${seed.territory.name}" pronto (${territoryId}).`)

  const userIdByEmail = new Map()

  for (const u of seed.users) {
    const { id: authId, isNew } = await ensureAuthUser(u.email)
    await ensureUserRow({
      id: authId,
      territory_id: territoryId,
      name: u.name,
      discipline: u.discipline,
      role: u.role,
    })
    userIdByEmail.set(u.email.toLowerCase(), authId)
    console.log(`Utente "${u.name}" (${u.role}) pronto${isNew ? ' — nuovo' : ''}.`)

    if (isNew) {
      const { error } = await supabase.auth.signInWithOtp({
        email: u.email,
        options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl}/login` },
      })
      if (error) console.error(`Invio magic link a ${u.email} fallito:`, error.message)
      else console.log(`Magic link inviato a ${u.email}.`)
    }
  }

  for (const r of seed.raci ?? []) {
    const userId = userIdByEmail.get(r.email.toLowerCase())
    if (!userId) {
      console.warn(`RACI: email ${r.email} non tra gli utenti seedati, riga saltata.`)
      continue
    }
    const { error } = await supabase.from('raci').upsert(
      {
        territory_id: territoryId,
        user_id: userId,
        sistema: r.sistema,
        pericolo: r.pericolo,
        field: r.field,
        role: r.role,
      },
      { onConflict: 'territory_id,user_id,sistema,pericolo,field' }
    )
    if (error) throw error
  }
  console.log(`Matrice RACI: ${seed.raci?.length ?? 0} assegnazioni importate.`)
}

main().catch((err) => {
  console.error('Errore seed-raci:', err)
  process.exit(1)
})
