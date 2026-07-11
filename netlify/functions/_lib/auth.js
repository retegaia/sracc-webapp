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
