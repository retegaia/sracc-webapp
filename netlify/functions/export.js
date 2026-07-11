// GET /api/export?format=word|excel&groupBy=sistema-pericolo|field —
// genera e restituisce il file dell'export delle catene d'impatto
// (2026-07-10). Nessun nuovo controllo di visibilità: i contributi visti
// sono esattamente quelli restituiti da GET /api/contributions (§3.1) —
// coordinatore vede tutto il territorio, contributor solo i propri —
// riusando lo stesso filtro già presente in handleGet di contributions.js,
// non duplicato in un modulo condiviso perché è tre righe e l'unica altra
// Function che lo usa non lo esporta.
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'
import { buildCombos, buildGroups } from './_lib/exportData.js'
import { generateWordBuffer } from './_lib/exportWord.js'
import { generateExcelBuffer } from './_lib/exportExcel.js'

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

  let contribQuery = supabase
    .from('contributions')
    .select('sistema, pericolo, field, factors, vulnerability, user_id')
    .eq('territory_id', caller.territory_id)
  if (caller.role !== 'coordinator') contribQuery = contribQuery.eq('user_id', caller.id)

  const [contribRes, territorialiRes, condivisiRes] = await Promise.all([
    contribQuery,
    supabase.from('impatti_attesi').select('sistema,pericolo,field,impatto,ordine').eq('territory_id', caller.territory_id),
    supabase.from('impatti_attesi').select('sistema,pericolo,field,impatto,ordine').is('territory_id', null),
  ])
  if (contribRes.error) return json({ error: contribRes.error.message }, 500)
  if (territorialiRes.error) return json({ error: territorialiRes.error.message }, 500)
  if (condivisiRes.error) return json({ error: condivisiRes.error.message }, 500)

  const combos = buildCombos(contribRes.data, [...territorialiRes.data, ...condivisiRes.data])
  const groups = buildGroups(combos, groupBy)

  let buffer, contentType, ext
  if (format === 'excel') {
    buffer = await generateExcelBuffer(groups)
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ext = 'xlsx'
  } else {
    buffer = await generateWordBuffer(groups)
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ext = 'docx'
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="SRACC-catene-impatto-${groupBy}.${ext}"`,
    },
  })
}
