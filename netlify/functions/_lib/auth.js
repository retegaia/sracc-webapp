// Helper condiviso da tutte le Function: client service-role e risoluzione
// del chiamante dal JWT Supabase.
//
// Multi-territorio reale (2026-07-11): un utente può avere accesso a più
// territori con ruoli diversi su ciascuno (user_territories, v.
// supabase/schema.sql) — non esiste più un "territorio dell'utente" unico.
// Il territorio su cui opera per la richiesta corrente arriva dal client
// nell'header X-Territory-Id (la scelta fatta una volta per sessione, v.
// src/hooks/useTerritorySelection.js), non da una colonna su `users`.
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

async function verifyJwt(supabase, authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwt = authHeader.slice('Bearer '.length)
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data?.user) return null
  return data.user.id
}

// Identità autenticata, senza risolvere alcun territorio — per gli unici
// due endpoint che non presuppongono un territorio attivo: GET
// /api/my-territories (serve a scoprire quali territori sono disponibili)
// e POST /api/territories (creazione di un nuovo territorio, non modifica
// di uno esistente).
export async function getCallerIdentity(supabase, req) {
  const userId = await verifyJwt(supabase, req.headers.get('authorization'))
  if (!userId) return null
  return { id: userId }
}

// Identità + territorio attivo + ruolo del chiamante su QUEL territorio
// specifico (da user_territories, non da users.role — in generale una
// persona può essere coordinator su un territorio e non su un altro).
// Restituisce { caller } oppure { errorResponse } già pronto da propagare
// così com'è (400 header assente, 401 JWT non valido, 403 territorio non
// autorizzato per questo utente) — centralizza qui la scelta dello status
// code invece di ripeterla in ogni Function.
export async function resolveCaller(supabase, req) {
  const userId = await verifyJwt(supabase, req.headers.get('authorization'))
  if (!userId) return { errorResponse: json({ error: 'non autenticato' }, 401) }

  const territoryId = req.headers.get('x-territory-id')
  if (!territoryId) return { errorResponse: json({ error: 'header X-Territory-Id mancante' }, 400) }

  const { data, error } = await supabase
    .from('user_territories')
    .select('role')
    .eq('user_id', userId)
    .eq('territory_id', territoryId)
    .maybeSingle()
  if (error) return { errorResponse: json({ error: error.message }, 500) }
  if (!data) return { errorResponse: json({ error: 'non autorizzato per questo territorio' }, 403) }

  return { caller: { id: userId, territory_id: territoryId, role: data.role } }
}

// --- Helper di autorizzazione condivisi (audit sicurezza 2026-07-16, F5) ---
// Prima duplicati verbatim in più Function: consolidati qui perché una
// regola di autorizzazione ripetuta in 3-7 punti è terreno da divergenza
// silenziosa (stessa classe del bug già corretto con sistemaLabels.js).
// Nessun cambiamento di comportamento: sono esattamente le stesse tre
// istruzioni di prima, spostate in un solo punto.

// Blocco scrittura per l'osservatore (sola lettura ovunque). Restituisce la
// Response 403 già pronta da propagare, oppure null se il chiamante può
// scrivere. Uso: `const denied = denyObserver(caller); if (denied) return denied`.
export function denyObserver(caller) {
  if (caller.role === 'observer') return json({ error: 'non autorizzato' }, 403)
  return null
}

// Restringe una query alle sole righe del chiamante (user_id === caller.id)
// a meno che il suo ruolo non sia tra quelli "che vedono tutto il territorio"
// (in genere coordinator e observer). Sostituisce il filtro duplicato in
// contributions.js, indicatori-scelti.js ed export.js.
export function scopeToOwnUnless(query, caller, privilegedRoles) {
  if (privilegedRoles.includes(caller.role)) return query
  return query.eq('user_id', caller.id)
}

// Esiste una riga RACI con ruolo 'referente' per questa combinazione? Unica
// autorizzazione di scrittura sui field (le Function bypassano le RLS con la
// service-role key). Prima duplicata identica in contributions.js e
// indicatori-scelti.js; ora usata anche da ai-classify.js (F2).
// 'referente'/'collaboratore' sostituiscono i quattro valori RACI classici
// R/A/C/I (2026-07-22, v. supabase/schema.sql): R e A abilitavano entrambi
// la scrittura, C e I nessuno dei due — collassati nei due soli
// comportamenti reali.
export async function isAssigned(supabase, { territory_id, user_id, sistema, pericolo, field }) {
  const { data, error } = await supabase
    .from('raci')
    .select('role')
    .eq('territory_id', territory_id)
    .eq('user_id', user_id)
    .eq('sistema', sistema)
    .eq('pericolo', pericolo)
    .eq('field', field)
    .eq('role', 'referente')
    .maybeSingle()
  if (error) throw error
  return !!data
}
