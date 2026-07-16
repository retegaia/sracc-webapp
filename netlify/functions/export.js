// GET /api/export?format=word|excel&groupBy=sistema-pericolo|field&dataset=fattori|indicatori
// — genera e restituisce il file dell'export delle catene d'impatto
// (2026-07-10) o degli indicatori (Fase 2, aggiunto 2026-07-16). Nessun
// nuovo controllo di visibilità in nessuno dei due dataset: fattori vede
// esattamente ciò che restituisce GET /api/contributions, indicatori
// esattamente ciò che restituisce GET /api/indicatori-scelti (§3.1 —
// coordinatore e observer vedono tutto il territorio, contributor solo i
// propri) — stesso endpoint invece di uno parallelo perché la sola parte
// che cambia è quale/come si costruiscono i `groups` passati ai generatori
// Word/Excel; auth/routing restano condivisi.
import { json, getServiceClient, resolveCaller, scopeToOwnUnless } from './_lib/auth.js'
import { buildCombos, buildGroups } from './_lib/exportData.js'
import { buildIndicatoriRows, buildIndicatoriGroups } from './_lib/exportIndicatoriData.js'
import { generateWordBuffer, generateIndicatoriWordBuffer } from './_lib/exportWord.js'
import { generateExcelBuffer, generateIndicatoriExcelBuffer } from './_lib/exportExcel.js'

async function buildFattoriGroups(supabase, caller, groupBy) {
  let contribQuery = supabase
    .from('contributions')
    .select('sistema, pericolo, field, factors, vulnerability, user_id')
    .eq('territory_id', caller.territory_id)
  contribQuery = scopeToOwnUnless(contribQuery, caller, ['coordinator', 'observer'])

  const [contribRes, territorialiRes, condivisiRes] = await Promise.all([
    contribQuery,
    supabase.from('impatti_attesi').select('sistema,pericolo,field,impatto,ordine').eq('territory_id', caller.territory_id),
    supabase.from('impatti_attesi').select('sistema,pericolo,field,impatto,ordine').is('territory_id', null),
  ])
  if (contribRes.error) throw contribRes.error
  if (territorialiRes.error) throw territorialiRes.error
  if (condivisiRes.error) throw condivisiRes.error

  const combos = buildCombos(contribRes.data, [...territorialiRes.data, ...condivisiRes.data])
  return buildGroups(combos, groupBy)
}

// Stessa visibilità di GET /api/indicatori-scelti (handleGet in
// indicatori-scelti.js) senza filtro sistema/pericolo — il caller vede o le
// proprie righe o l'intero territorio. Tipologia/categoria arrivano da una
// query separata sulla libreria `indicatori` (condivisa + territoriale,
// come indicatori.js), non filtrata per id: il dataset è piccolo e questo
// evita di dover costruire una clausola IN dinamica sugli id referenziati.
async function buildIndicatoriExportGroups(supabase, caller, groupBy) {
  let sceltiQuery = supabase.from('indicatori_scelti').select('sistema, pericolo, field, indicatori, status, user_id').eq('territory_id', caller.territory_id)
  sceltiQuery = scopeToOwnUnless(sceltiQuery, caller, ['coordinator', 'observer'])

  const [sceltiRes, territorialiRes, condivisiRes] = await Promise.all([
    sceltiQuery,
    supabase.from('indicatori').select('id, tipologia, categoria').eq('territory_id', caller.territory_id),
    supabase.from('indicatori').select('id, tipologia, categoria').is('territory_id', null),
  ])
  if (sceltiRes.error) throw sceltiRes.error
  if (territorialiRes.error) throw territorialiRes.error
  if (condivisiRes.error) throw condivisiRes.error

  const rows = buildIndicatoriRows(sceltiRes.data, [...territorialiRes.data, ...condivisiRes.data])
  return buildIndicatoriGroups(rows, groupBy)
}

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller

  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'excel' ? 'excel' : 'word'
  const groupBy = url.searchParams.get('groupBy') === 'field' ? 'field' : 'sistema-pericolo'
  const dataset = url.searchParams.get('dataset') === 'indicatori' ? 'indicatori' : 'fattori'

  let groups
  try {
    groups = dataset === 'indicatori' ? await buildIndicatoriExportGroups(supabase, caller, groupBy) : await buildFattoriGroups(supabase, caller, groupBy)
  } catch (err) {
    return json({ error: err.message }, 500)
  }

  let buffer, contentType, ext
  if (format === 'excel') {
    buffer = dataset === 'indicatori' ? await generateIndicatoriExcelBuffer(groups) : await generateExcelBuffer(groups)
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ext = 'xlsx'
  } else {
    buffer = dataset === 'indicatori' ? await generateIndicatoriWordBuffer(groups) : await generateWordBuffer(groups)
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ext = 'docx'
  }

  const filenamePrefix = dataset === 'indicatori' ? 'RADAPT-indicatori' : 'RADAPT-catene-impatto'

  return new Response(buffer, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filenamePrefix}-${groupBy}.${ext}"`,
    },
  })
}
