// POST /api/ai/classify — implementato in S5 (§3.1 Tab.2, §3.2, §6.1)
// Classifica un fattore a testo libero in una delle tre componenti IPCC AR6
// (Esposizione/Sensibilità/Capacità adattiva). Ogni chiamata è indipendente e
// senza stato (§6.1): nessun contesto conversazionale tra una chiamata e
// l'altra. ANTHROPIC_API_KEY resta sempre lato server — mai esposta al
// client (§3, Tab.1); questa Function è l'unico punto che la legge.
import Anthropic from '@anthropic-ai/sdk'
import { json, getServiceClient, resolveCaller, denyObserver, isAssigned } from './_lib/auth.js'

// La specifica (§6.1) indica claude-sonnet-4-20250514, ma quel modello
// risulta ritirato lato Anthropic (404 verificato con la chiave in uso, oggi
// oltre la data di dismissione annunciata del 15/06/2026). claude-sonnet-5 è
// il successore diretto nella stessa fascia — deviazione confermata con
// Andrea Vallebona il 2026-07-10.
const MODEL = 'claude-sonnet-5'
const COMPONENTI = ['Esposizione', 'Sensibilita', 'Capacita adattiva']
const CONFIDENZE = ['alta', 'media', 'bassa']

const SYSTEM_PROMPT = `Sei un assistente esperto di valutazione della vulnerabilità climatica secondo il framework IPCC AR6. Classifichi un fattore descritto in linguaggio libero da un referente territoriale in una delle tre componenti della vulnerabilità:

- Esposizione: presenza di persone, mezzi di sussistenza, specie o ecosistemi, funzioni ambientali, servizi, risorse, infrastrutture o beni economici, sociali o culturali in luoghi e contesti che potrebbero essere influenzati negativamente dal pericolo climatico considerato.
- Sensibilita: il grado in cui un sistema (naturale o antropico) è influenzato, positivamente o negativamente, dalla variabilità climatica o dal pericolo — condizioni strutturali o intrinseche che aumentano o riducono la fragilità del sistema rispetto al pericolo.
- Capacita adattiva: la capacità di sistemi, istituzioni, persone e altri organismi di adattarsi a potenziali danni, di sfruttare le opportunità o di rispondere alle conseguenze — risorse, competenze, governance e strumenti di risposta disponibili.

Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo prima o dopo, senza blocchi di codice markdown, con questa forma esatta:
{"componente": "Esposizione" oppure "Sensibilita" oppure "Capacita adattiva", "motivazione": "spiegazione breve in italiano, una frase", "confidenza": "alta" oppure "media" oppure "bassa"}`

function buildUserPrompt({ testo, sistema, pericolo, field }) {
  return `Sistema: ${sistema}\nPericolo: ${pericolo}\nImpact field: ${field}\nFattore da classificare: "${testo}"`
}

function parseResponse(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim()
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!COMPONENTI.includes(parsed.componente)) return null
  return {
    componente: parsed.componente,
    motivazione: typeof parsed.motivazione === 'string' ? parsed.motivazione : '',
    confidenza: CONFIDENZE.includes(parsed.confidenza) ? parsed.confidenza : 'bassa',
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'server non configurato (ANTHROPIC_API_KEY mancante)' }, 500)

  const supabase = getServiceClient()
  if (!supabase) return json({ error: 'server non configurato' }, 500)

  const result = await resolveCaller(supabase, req)
  if (result.errorResponse) return result.errorResponse
  const caller = result.caller

  // Audit sicurezza 2026-07-16 (F2): prima questo endpoint non aveva alcun
  // gate di ruolo — un osservatore (o qualunque membro del territorio)
  // poteva consumare l'API Anthropic a pagamento con richieste dirette,
  // aggirando la UI (che lo chiama solo dal form referente). Ora due
  // barriere, come per la scrittura di contributions.js:
  // 1) l'osservatore non innesca mai azioni (invariante di tutto il progetto);
  const denied = denyObserver(caller)
  if (denied) return denied

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON non valido' }, 400)
  }

  const { testo, sistema, pericolo, field } = body ?? {}
  if (!testo?.trim() || !sistema || !pericolo || !field) {
    return json({ error: 'testo, sistema, pericolo e field sono obbligatori' }, 400)
  }

  // 2) classificare un fattore è parte della compilazione di un field: ha
  // senso solo per chi è assegnato (RACI R/A) a quel field, esattamente come
  // il POST che poi salverà il contributo (contributions.js) — chiude del
  // tutto il vettore "qualunque contributor brucia l'API su field non suoi".
  // Non rompe la UX: il form mostra il pulsante di classificazione solo al
  // referente sui propri field assegnati.
  let assigned
  try {
    assigned = await isAssigned(supabase, {
      territory_id: caller.territory_id,
      user_id: caller.id,
      sistema,
      pericolo,
      field,
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
  if (!assigned) return json({ error: 'non sei assegnato (RACI) a questo field' }, 403)

  const anthropic = new Anthropic({ apiKey })

  let message
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      // Thinking disattivato: con max_tokens così basso, il thinking
      // adattivo (di default su claude-sonnet-5) rischierebbe di consumare
      // il budget prima di produrre il JSON di risposta.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt({ testo, sistema, pericolo, field }) }],
    })
  } catch (err) {
    return json({ error: `Anthropic API: ${err.message}` }, 502)
  }

  const textBlock = message.content.find((b) => b.type === 'text')
  const parsed = textBlock && parseResponse(textBlock.text)
  if (!parsed) return json({ error: 'risposta AI non interpretabile' }, 502)

  return json(parsed)
}
