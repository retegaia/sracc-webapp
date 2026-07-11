// POST /api/ai/overlaps — implementato in S5 (§3.1 Tab.2, §6.2)
// Rileva sovrapposizioni semantiche tra fattori inseriti da referenti diversi
// per la stessa combinazione sistema×pericolo (fattori scritti con parole
// diverse ma che descrivono lo stesso fenomeno). Chiamata batch, usata solo
// dalla vista coordinatore (SignalView), mai dal form referente (§6.2) — per
// questo l'accesso è ristretto al ruolo coordinator, come /api/raci.
import Anthropic from '@anthropic-ai/sdk'
import { json, getServiceClient, resolveCaller } from './_lib/auth.js'

// V. nota in ai-classify.js: claude-sonnet-4-20250514 (§6.1) è ritirato,
// sostituito da claude-sonnet-5 — stessa deviazione, stesso modello per
// coerenza tra le due chiamate del modulo AI (confermato con Andrea
// Vallebona il 2026-07-10).
const MODEL = 'claude-sonnet-5'
const MAX_FATTORI = 30
const MAX_SOVRAPPOSIZIONI = 3

const SYSTEM_PROMPT = `Sei un assistente esperto di valutazione della vulnerabilità climatica. Ricevi un elenco di fattori di vulnerabilità raccolti da referenti diversi per la stessa combinazione sistema × pericolo. Individua coppie o gruppi di fattori che, pur essendo scritti con parole diverse, descrivono lo stesso fenomeno o concetto (sovrapposizioni semantiche) — utile al coordinatore per unificare la libreria.

Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo prima o dopo, senza blocchi di codice markdown, con questa forma esatta:
{"sovrapposizioni": ["descrizione breve in italiano della sovrapposizione 1", "..."]}
Includi al massimo ${MAX_SOVRAPPOSIZIONI} sovrapposizioni, le più rilevanti. Se non trovi sovrapposizioni evidenti, restituisci un array vuoto.`

function buildUserPrompt({ sistema, pericolo, fattori }) {
  const elenco = fattori.map((f, i) => `${i + 1}. ${f}`).join('\n')
  return `Sistema: ${sistema}\nPericolo: ${pericolo}\nFattori:\n${elenco}`
}

function parseResponse(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim()
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!Array.isArray(parsed.sovrapposizioni)) return null
  return parsed.sovrapposizioni.filter((s) => typeof s === 'string' && s.trim()).slice(0, MAX_SOVRAPPOSIZIONI)
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'server non configurato (ANTHROPIC_API_KEY mancante)' }, 500)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  if (result.caller.role !== 'coordinator') return json({ error: 'non autorizzato' }, 403)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { sistema, pericolo, fattori } = body ?? {}
  if (!sistema || !pericolo || !Array.isArray(fattori) || fattori.length < 2) {
    return json({ error: 'sistema, pericolo e fattori (array di almeno 2 nomi) sono obbligatori' }, 400)
  }

  const anthropic = new Anthropic({ apiKey })

  let message
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt({ sistema, pericolo, fattori: fattori.slice(0, MAX_FATTORI) }) },
      ],
    })
  } catch (err) {
    return json({ error: `Anthropic API: ${err.message}` }, 502)
  }

  const textBlock = message.content.find((b) => b.type === 'text')
  const sovrapposizioni = textBlock && parseResponse(textBlock.text)
  if (sovrapposizioni === null) return json({ error: 'risposta AI non interpretabile' }, 502)

  return json({ sovrapposizioni })
}
