import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { sistemaShortLabel } from '../lib/sistemaLabels.js'

const FC = { Esposizione: '#0C447C', Sensibilita: '#993C1D', 'Capacita adattiva': '#4A7C59' }
const COMP_LABEL = { Esposizione: 'Esposizione', Sensibilita: 'Sensibilità', 'Capacita adattiva': 'Capacità adattiva' }
// Colore neutro dei nodi field (punto 1, correzione simbologia 2026-07-13):
// stesso grigio "muted" già usato per i placeholder library-only
// nell'export (exportWord.js/exportExcel.js, MUTED_COLOR '999999') — non
// un settimo colore-per-sistema. Il sistema di appartenenza di un field
// resta leggibile da etichetta/tooltip, non ha più un canale colore
// dedicato: prima il colore veniva usato con due significati diversi
// (componente sui fattori, sistema sui field) nella stessa legenda,
// fonte di confusione segnalata da Andrea dopo aver visto il grafo con
// dati reali.
const FIELD_COLOR = '#999999'
const W = 680
const H = 400

// Idee discusse e rimandate esplicitamente (non implementare senza una
// nuova richiesta):
// - Vista "field per pericolo": si sovrappone troppo alla Heatmap
//   esistente (già copre sistema×pericolo).
// - Diagramma di flusso stile Sankey per la vista d'insieme: costo di
//   implementazione alto, nessuna urgenza espressa.
// - Stessa logica di pervasività applicata a indicatori_scelti: i dati
//   non sono ancora maturi, l'onboarding disciplinare reale non è
//   partito (v. sracc_multi_territory_readiness_audit in memoria).

// Costruisce il grafo bipartito fattore↔field dai contributi reali (non
// hardcoded come nel prototipo). Chiude la questione aperta B2 (§11, Tab.9)
// con l'encoding deciso da Andrea Vallebona il 2026-07-10: dimensione nodo
// fattore = contribuzione totale (stessa logica di PervasivityView, S4);
// spessore arco fattore→field = numero di contributi che li collegano
// (non "co-occorrenza tra coppie di fattori" in senso stretto — il grafo
// resta bipartito come nel prototipo, non un grafo di soli fattori: scelta
// confermata con Andrea il 2026-07-10); colore nodo fattore = componente.
//
// Estesa il 2026-07-13 (correzione simbologia + viste "Field correlati" e
// "Classifica fattori", dati condivisi): ogni nodo fattore traccia anche
// `sistemi` (i sistemi distinti raggiunti tramite i field a cui è
// collegato) per il criterio di pervasività "tra sistemi" (punto 2), e
// ogni nodo field traccia `count` (contribuzione totale, stessa metrica di
// conteggio già usata per i fattori) per la dimensione dei nodi nella
// nuova vista "Field correlati" — nessuna nuova query, entrambi derivano
// dallo stesso ciclo su contributions già esistente.
function buildGraph(contributions) {
  const factors = new Map() // key: nome normalizzato -> { id, nome, componente, count, fields: Set, sistemi: Set }
  const fields = new Map() // key: nome field -> { id, nome, sistema, factors: Set, count }
  const edges = new Map() // key: `${factorKey}|||${fieldKey}` -> peso

  for (const c of contributions) {
    // Riga senza fattori (bozza mai iniziata, o scheda resettata) — ignorata
    // per non lasciare un nodo field isolato senza archi (v. BowTie.jsx).
    // Se un altro contributo reale tocca lo stesso field, il nodo viene
    // comunque creato da quella riga.
    if (!c.factors?.length) continue
    if (!fields.has(c.field)) fields.set(c.field, { id: c.field, nome: c.field, sistema: c.sistema, factors: new Set(), count: 0 })
    const fieldNode = fields.get(c.field)
    for (const f of c.factors) {
      const key = f.nome.trim().toLowerCase()
      if (!key) continue
      if (!factors.has(key)) {
        factors.set(key, { id: key, nome: f.nome, componente: f.componente, strato: f.strato, count: 0, fields: new Set(), sistemi: new Set() })
      }
      const factorNode = factors.get(key)
      factorNode.count++
      factorNode.fields.add(c.field)
      factorNode.sistemi.add(c.sistema)
      fieldNode.factors.add(key)
      fieldNode.count++
      const edgeKey = `${key}|||${c.field}`
      edges.set(edgeKey, (edges.get(edgeKey) || 0) + 1)
    }
  }

  const nodes = [
    ...[...factors.values()].map((f) => ({ ...f, type: 'factor' })),
    ...[...fields.values()].map((f) => ({ ...f, type: 'field' })),
  ]
  const links = [...edges.entries()].map(([key, weight]) => {
    const [factorKey, fieldKey] = key.split('|||')
    return { source: factorKey, target: fieldKey, weight }
  })
  const sistemi = [...new Set([...fields.values()].map((f) => f.sistema))].sort()

  return { nodes, links, sistemi }
}

// Grafo field↔field per la vista "Field correlati" (punto 3): due field
// sono collegati se condividono almeno un fattore, peso = quanti fattori
// condividono. Derivato dai soli nodi fattore già calcolati da buildGraph
// (ogni fattore sa già a quali field è collegato via `fields`) — nessuna
// nuova query, nessuna dipendenza dal criterio di pervasività (una
// correlazione tra due field è reale anche se il fattore condiviso non è
// "pervasivo" nel senso dei punti 1-2, che è un concetto distinto).
function buildFieldFieldGraph(rawNodes) {
  const fieldNodes = rawNodes.filter((n) => n.type === 'field')
  const factorNodes = rawNodes.filter((n) => n.type === 'factor')
  const edgeMap = new Map()
  for (const f of factorNodes) {
    const fieldsArr = [...f.fields].sort()
    for (let i = 0; i < fieldsArr.length; i++) {
      for (let j = i + 1; j < fieldsArr.length; j++) {
        const key = `${fieldsArr[i]}|||${fieldsArr[j]}`
        if (!edgeMap.has(key)) edgeMap.set(key, { source: fieldsArr[i], target: fieldsArr[j], weight: 0, factors: [] })
        const e = edgeMap.get(key)
        e.weight++
        e.factors.push({ nome: f.nome, componente: f.componente })
      }
    }
  }
  return { nodes: fieldNodes, links: [...edgeMap.values()] }
}

function arcPositions(ids, baseDeg, spreadDeg, cx, cy, arcR) {
  const base = (baseDeg * Math.PI) / 180
  const spread = (spreadDeg * Math.PI) / 180
  return ids.map((id, i) => {
    const t = ids.length === 1 ? 0 : i / (ids.length - 1) - 0.5
    const a = base + t * spread
    return { id, x: cx + arcR * Math.cos(a), y: cy + arcR * Math.sin(a) }
  })
}

// Opacità di un nodo dati i due filtri correnti (sistema, field) — funzione
// pura, condivisa tra il pointerout handler (chiuso nell'effect D3, deve
// leggere i filtri da ref) e l'effect dedicato ai filtri (legge dallo
// state direttamente). Il filtro sistema non oscura mai un nodo fattore
// (comportamento esistente, invariato: un fattore può attraversare più
// sistemi, oscurarlo per sistema lo nasconderebbe anche dove è pervasivo).
// Il filtro field invece isola per davvero — un fattore non collegato al
// field selezionato viene oscurato, altrimenti il filtro field non
// isolerebbe nulla (la maggioranza dei nodi fattore resterebbe comunque a
// piena opacità).
function nodeOpacity(d, sistemaF, fieldF) {
  if (d.type === 'field') {
    const sistemaOk = sistemaF === 'all' || d.sistema === sistemaF
    const fieldOk = fieldF === 'all' || d.nome === fieldF
    return sistemaOk && fieldOk ? 1 : 0.12
  }
  const fieldOk = fieldF === 'all' || d.fields.has(fieldF)
  return fieldOk ? 1 : 0.12
}

// Criterio di pervasività (punto 2): "tra field" (default) conta un
// fattore pervasivo se collegato a 2+ field distinti — "tra sistemi" è più
// severo, conta pervasivo solo se i field collegati appartengono a 2+
// sistemi distinti (isola i fattori davvero trasversali ai settori, non
// solo tra ambiti vicini dello stesso sistema). Entrambi i conteggi sono
// già sui nodi fattore da buildGraph.
function isPervasive(factorNode, mode) {
  return mode === 'sistema' ? factorNode.sistemi.size >= 2 : factorNode.fields.size >= 2
}

function LegendShape({ shape, color }) {
  const s = 12
  if (shape === 'triangle') {
    return (
      <svg width={s} height={s} viewBox="-6 -6 12 12">
        <polygon points="0,-5.5 4.76,2.75 -4.76,2.75" fill={color} />
      </svg>
    )
  }
  if (shape === 'square') {
    return (
      <svg width={s} height={s} viewBox="-6 -6 12 12">
        <rect x={-4.5} y={-4.5} width={9} height={9} fill={color} />
      </svg>
    )
  }
  if (shape === 'rounded-rect') {
    return (
      <svg width={s} height={s} viewBox="-6 -6 12 12">
        <rect x={-5} y={-5} width={10} height={10} rx={3} fill={color} />
      </svg>
    )
  }
  return (
    <svg width={s} height={s} viewBox="-6 -6 12 12">
      <circle r={5} fill={color} />
    </svg>
  )
}

function SistemaFilterRow({ sistemi, value, onChange }) {
  return (
    <div className="g-filters">
      <button className={`g-fbtn${value === 'all' ? ' on' : ''}`} onClick={() => onChange('all')}>
        Tutti i sistemi
      </button>
      {sistemi.map((s) => (
        <button key={s} className={`g-fbtn${value === s ? ' on' : ''}`} onClick={() => onChange(s)}>
          {sistemaShortLabel(s)}
        </button>
      ))}
    </div>
  )
}

function PervasivenessModeToggle({ value, onChange }) {
  return (
    <div className="g-filters">
      <button className={`g-fbtn${value === 'field' ? ' on' : ''}`} onClick={() => onChange('field')}>
        Pervasivo tra field
      </button>
      <button className={`g-fbtn${value === 'sistema' ? ' on' : ''}`} onClick={() => onChange('sistema')}>
        Pervasivo tra sistemi
      </button>
    </div>
  )
}

// Vista "Fattori per field" (il grafo originale, S7, con la simbologia
// corretta al punto 1): bipartito fattore↔field, D3 force simulation,
// drag, tooltip on hover, filtri sistema/field, criterio di pervasività
// commutabile, toggle mostra-tutti.
function FactorFieldGraph({
  rawNodes,
  rawLinks,
  sistemi,
  fieldNames,
  sistemaFilter,
  setSistemaFilter,
  fieldFilter,
  setFieldFilter,
  showAllFactors,
  setShowAllFactors,
  pervasivenessMode,
  setPervasivenessMode,
}) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)
  const simRef = useRef(null)
  // Gli handler dentro l'effect D3 sotto (che monta una sola volta per
  // dataset) devono leggere i filtri correnti, non quelli catturati al
  // mount: senza i ref i filtri selezionati si "dimenticavano" dopo il
  // primo hover, tornando a mostrare tutti i nodi a piena opacità — bug
  // già corretto in S7 per il filtro sistema, stesso pattern per field.
  const sistemaFilterRef = useRef(sistemaFilter)
  sistemaFilterRef.current = sistemaFilter
  const fieldFilterRef = useRef(fieldFilter)
  fieldFilterRef.current = fieldFilter

  // Esclusione vera (non solo dimming) dei fattori non pervasivi quando
  // showAllFactors è false — tolti da nodi E archi passati alla
  // simulazione, non solo resi trasparenti, altrimenti continuerebbero a
  // occupare spazio ed esercitare le forze di repulsione. I nodi field non
  // vengono mai esclusi (sono gli ancoraggi della vista).
  const { visibleNodes, visibleLinks } = useMemo(() => {
    if (showAllFactors) return { visibleNodes: rawNodes, visibleLinks: rawLinks }
    const excludedFactorIds = new Set(
      rawNodes.filter((n) => n.type === 'factor' && !isPervasive(n, pervasivenessMode)).map((n) => n.id)
    )
    return {
      visibleNodes: rawNodes.filter((n) => n.type !== 'factor' || !excludedFactorIds.has(n.id)),
      visibleLinks: rawLinks.filter((l) => !excludedFactorIds.has(l.source)),
    }
  }, [rawNodes, rawLinks, showAllFactors, pervasivenessMode])

  useEffect(() => {
    const svgEl = svgRef.current
    const tooltipEl = tooltipRef.current
    if (!svgEl || !visibleNodes.length) return

    // Copie mutabili per la simulation (d3 vi scrive x/y/vx/vy/index)
    const nodes = visibleNodes.map((n) => ({ ...n }))
    const links = visibleLinks.map((l) => ({ ...l }))

    const cx = W / 2
    const cy = H / 2
    const arcR = 170
    const bySistema = new Map(sistemi.map((s) => [s, []]))
    nodes.filter((n) => n.type === 'field').forEach((n) => bySistema.get(n.sistema)?.push(n.id))
    const spread = sistemi.length ? 300 / sistemi.length : 300
    const fpos = sistemi.flatMap((s, i) => arcPositions(bySistema.get(s) || [], 15 + i * (330 / sistemi.length), spread, cx, cy, arcR))
    nodes.forEach((n) => {
      if (n.type === 'field') {
        const p = fpos.find((x) => x.id === n.id)
        if (p) {
          n.x = p.x
          n.y = p.y
        }
      } else {
        n.x = cx + (Math.random() - 0.5) * 60
        n.y = cy + (Math.random() - 0.5) * 60
      }
    })

    const counts = nodes.filter((n) => n.type === 'factor').map((n) => n.count)
    const minC = Math.min(...counts, 1)
    const maxC = Math.max(...counts, 1)
    const rSc = d3.scaleLinear().domain([minC, maxC]).range(minC === maxC ? [14, 14] : [8, 22])
    const getR = (n) => (n.type === 'factor' ? rSc(n.count) : 10)

    const weights = links.map((l) => l.weight)
    const wSc = d3.scaleLinear().domain([1, Math.max(...weights, 1)]).range([1, 5])

    const svg = d3.select(svgEl).attr('viewBox', `0 0 ${W} ${H}`)
    svg.selectAll('*').remove()
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#f7f7f5').attr('rx', 10)
    const gL = svg.append('g')
    const gN = svg.append('g')

    const simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(100).strength(0.4))
      .force('charge', d3.forceManyBody().strength((d) => (d.type === 'factor' ? -200 : -70)))
      .force('center', d3.forceCenter(cx, cy).strength(0.03))
      .force('collide', d3.forceCollide().radius((d) => getR(d) + 7).strength(0.85))
      .force('xi', d3.forceX((d) => (d.type === 'field' ? d.x : cx)).strength((d) => (d.type === 'field' ? 0.18 : 0)))
      .force('yi', d3.forceY((d) => (d.type === 'field' ? d.y : cy)).strength((d) => (d.type === 'field' ? 0.18 : 0)))
      .alphaDecay(0.025)
    simRef.current = simulation

    const link = gL
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => {
        const s = nodes.find((n) => n.id === d.source.id || n.id === d.source)
        return s ? FC[s.componente] || '#888' : '#aaa'
      })
      .attr('stroke-opacity', 0.35)
      .attr('stroke-width', (d) => wSc(d.weight))

    const node = gN
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (e, d) => {
            if (!e.active) simulation.alphaTarget(0.15).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (e, d) => {
            d.fx = e.x
            d.fy = e.y
          })
          .on('end', (e, d) => {
            if (!e.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    // Simbologia (punto 1, corretta 2026-07-13): la forma codifica il tipo
    // di nodo — triangolo/quadrato/cerchio per Esposizione/Sensibilità/
    // Capacità adattiva (ridondante col colore già in uso altrove per lo
    // stesso componente, non solo colore), rettangolo arrotondato neutro
    // per i field (nessun colore-per-sistema). Dimensione (getR) e bordo
    // tratteggiato per strato IN restano gli stessi di prima, solo la
    // forma/riempimento cambiano.
    node.each(function (d) {
      const g = d3.select(this)
      const r = getR(d)
      const dash = d.type === 'factor' && d.strato === 'IN' ? '4,3' : null
      if (d.type === 'field') {
        const s = r * 1.6
        g.append('rect')
          .attr('x', -s / 2)
          .attr('y', -s / 2)
          .attr('width', s)
          .attr('height', s)
          .attr('rx', 4)
          .attr('fill', FIELD_COLOR)
          .attr('fill-opacity', 0.85)
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5)
      } else if (d.componente === 'Esposizione') {
        const pts = [0, 120, 240]
          .map((a) => {
            const rad = ((a - 90) * Math.PI) / 180
            return `${r * Math.cos(rad)},${r * Math.sin(rad)}`
          })
          .join(' ')
        g.append('polygon')
          .attr('points', pts)
          .attr('fill', FC.Esposizione)
          .attr('fill-opacity', 0.9)
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', dash)
      } else if (d.componente === 'Sensibilita') {
        const s = r * 1.6
        g.append('rect')
          .attr('x', -s / 2)
          .attr('y', -s / 2)
          .attr('width', s)
          .attr('height', s)
          .attr('fill', FC.Sensibilita)
          .attr('fill-opacity', 0.9)
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', dash)
      } else {
        g.append('circle')
          .attr('r', r)
          .attr('fill', FC['Capacita adattiva'] || '#888')
          .attr('fill-opacity', 0.9)
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', dash)
      }
    })

    // Applica subito il filtro sistema/field corrente — questo effect si
    // rimonta anche per un toggle di "Mostra tutti i fattori" o del
    // criterio di pervasività (cambiano visibleNodes/visibleLinks), non
    // solo per un nuovo dataset: senza questo, i nuovi nodi nascerebbero
    // tutti a piena opacità e un filtro già attivo sembrerebbe
    // "dimenticato" finché l'utente non tocca di nuovo un bottone filtro o
    // passa il mouse su un nodo.
    node.attr('opacity', (d) => nodeOpacity(d, sistemaFilterRef.current, fieldFilterRef.current))

    node
      .filter((d) => d.type === 'field')
      .append('text')
      .attr('dy', (d) => getR(d) + 11)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#666')
      .text((d) => d.nome)
      .style('pointer-events', 'none')

    node.on('pointerover', (e, d) => {
      let html = `<strong>${d.nome}</strong><br>`
      if (d.type === 'factor') {
        html += `${COMP_LABEL[d.componente] || d.componente}${d.strato ? ` · ${d.strato === 'IN' ? 'Invariante' : d.strato === 'ST' ? 'Specificità' : 'Variabile'}` : ''}<br>Occorrenze: ${d.count} · Field collegati: ${d.fields.size} · Sistemi collegati: ${d.sistemi.size}`
      } else {
        html += `${d.sistema}<br>Contribuzione totale: ${d.count} · Fattori collegati: ${d.factors.size}`
      }
      tooltipEl.innerHTML = html
      tooltipEl.style.display = 'block'
      node.attr('opacity', (n) => {
        if (n === d) return 1
        return links.some((l) => {
          const s = l.source.id || l.source
          const t = l.target.id || l.target
          return (s === d.id && t === n.id) || (t === d.id && s === n.id)
        })
          ? 1
          : 0.15
      })
      link
        .attr('stroke-opacity', (l) => {
          const s = l.source.id || l.source
          const t = l.target.id || l.target
          return s === d.id || t === d.id ? 0.8 : 0.05
        })
        .attr('stroke-width', (l) => {
          const s = l.source.id || l.source
          const t = l.target.id || l.target
          return s === d.id || t === d.id ? wSc(l.weight) + 1.5 : wSc(l.weight)
        })
    })
    node.on('pointermove', (e) => {
      tooltipEl.style.left = `${e.clientX + 14}px`
      tooltipEl.style.top = `${e.clientY - 10}px`
    })
    node.on('pointerout', () => {
      tooltipEl.style.display = 'none'
      node.attr('opacity', (d) => nodeOpacity(d, sistemaFilterRef.current, fieldFilterRef.current))
      link.attr('stroke-opacity', 0.35).attr('stroke-width', (d) => wSc(d.weight))
    })

    simulation.on('tick', () => {
      nodes.forEach((n) => {
        const r = getR(n) + 2
        n.x = Math.max(r, Math.min(W - r, n.x))
        n.y = Math.max(r, Math.min(H - r, n.y))
      })
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
      simRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, visibleLinks, sistemi])

  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current)
      .selectAll('g g')
      .attr('opacity', (d) => (!d ? 1 : nodeOpacity(d, sistemaFilter, fieldFilter)))
  }, [sistemaFilter, fieldFilter])

  return (
    <div className="card">
      <div className="ct">Fattori per field</div>
      <SistemaFilterRow sistemi={sistemi} value={sistemaFilter} onChange={setSistemaFilter} />
      <div className="g-filters">
        <button className={`g-fbtn${fieldFilter === 'all' ? ' on' : ''}`} onClick={() => setFieldFilter('all')}>
          Tutti i field
        </button>
        {fieldNames.map((f) => (
          <button key={f} className={`g-fbtn${fieldFilter === f ? ' on' : ''}`} onClick={() => setFieldFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <PervasivenessModeToggle value={pervasivenessMode} onChange={setPervasivenessMode} />
      <div className="g-filters">
        <button className={`g-fbtn${showAllFactors ? ' on' : ''}`} onClick={() => setShowAllFactors((v) => !v)}>
          {showAllFactors
            ? `Mostra solo fattori pervasivi (${pervasivenessMode === 'sistema' ? '2+ sistemi' : '2+ field'})`
            : 'Mostra tutti i fattori'}
        </button>
      </div>
      <svg ref={svgRef} id="graphsvg" height="400" viewBox={`0 0 ${W} ${H}`} />
      <div className="g-tooltip" ref={tooltipRef} />
      <div className="leg" style={{ marginTop: 10 }}>
        <span style={{ fontWeight: 600, color: '#666' }}>Fattori (componente):</span>
        <div className="li">
          <LegendShape shape="triangle" color={FC.Esposizione} /> Esposizione
        </div>
        <div className="li">
          <LegendShape shape="square" color={FC.Sensibilita} /> Sensibilità
        </div>
        <div className="li">
          <LegendShape shape="circle" color={FC['Capacita adattiva']} /> Cap. adattiva
        </div>
        <span style={{ fontWeight: 600, color: '#666', marginLeft: 8 }}>Field:</span>
        <div className="li">
          <LegendShape shape="rounded-rect" color={FIELD_COLOR} /> Impact field
        </div>
        <div style={{ marginLeft: 'auto' }}>dimensione = contribuzione totale · linea = n. contributi</div>
      </div>
    </div>
  )
}

// Vista "Field correlati" (punto 3, nuova): grafo field↔field, arco =
// almeno un fattore condiviso, spessore = n. fattori condivisi. Nodo field
// stessa forma/colore neutro del punto 1, dimensione = contribuzione
// totale del field (non fissa come nella vista bipartita, dove la
// dimensione dei field "resta invariata" per istruzione esplicita — qui è
// una vista nuova, la dimensione ha senso mostrarla). Stesso filtro
// sistema già esistente altrove, applicato con la stessa semantica
// (dimming, non esclusione).
function FieldFieldGraph({ rawNodes, sistemaFilter }) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)
  const simRef = useRef(null)
  const sistemaFilterRef = useRef(sistemaFilter)
  sistemaFilterRef.current = sistemaFilter

  const { nodes: rawFNodes, links: rawFLinks } = useMemo(() => buildFieldFieldGraph(rawNodes), [rawNodes])

  useEffect(() => {
    const svgEl = svgRef.current
    const tooltipEl = tooltipRef.current
    if (!svgEl || !rawFNodes.length) return

    const nodes = rawFNodes.map((n) => ({ ...n }))
    const links = rawFLinks.map((l) => ({ ...l }))

    const cx = W / 2
    const cy = H / 2

    const counts = nodes.map((n) => n.count)
    const minC = Math.min(...counts, 1)
    const maxC = Math.max(...counts, 1)
    const sSc = d3.scaleLinear().domain([minC, maxC]).range(minC === maxC ? [24, 24] : [16, 40])
    const getS = (n) => sSc(n.count)

    const weights = links.map((l) => l.weight)
    const wSc = d3.scaleLinear().domain([1, Math.max(...weights, 1)]).range([1, 6])

    const svg = d3.select(svgEl).attr('viewBox', `0 0 ${W} ${H}`)
    svg.selectAll('*').remove()
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#f7f7f5').attr('rx', 10)
    const gL = svg.append('g')
    const gN = svg.append('g')

    const simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(90).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-160))
      .force('center', d3.forceCenter(cx, cy))
      .force('collide', d3.forceCollide().radius((d) => getS(d) / 1.3 + 6).strength(0.85))
      .alphaDecay(0.03)
    simRef.current = simulation

    const link = gL
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', (d) => wSc(d.weight))
      .style('cursor', 'pointer')

    const node = gN
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (e, d) => {
            if (!e.active) simulation.alphaTarget(0.15).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (e, d) => {
            d.fx = e.x
            d.fy = e.y
          })
          .on('end', (e, d) => {
            if (!e.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    node
      .append('rect')
      .attr('x', (d) => -getS(d) / 2)
      .attr('y', (d) => -getS(d) / 2)
      .attr('width', getS)
      .attr('height', getS)
      .attr('rx', 5)
      .attr('fill', FIELD_COLOR)
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

    // Stessa cautela della vista bipartita: applica subito il filtro
    // sistema corrente, altrimenti i nodi appena creati nascerebbero a
    // piena opacità e il filtro sembrerebbe "dimenticato".
    node.attr('opacity', (d) => (sistemaFilterRef.current === 'all' || d.sistema === sistemaFilterRef.current ? 1 : 0.12))

    node
      .append('text')
      .attr('dy', (d) => getS(d) / 2 + 11)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#666')
      .text((d) => d.nome)
      .style('pointer-events', 'none')

    node.on('pointerover', (e, d) => {
      tooltipEl.innerHTML = `<strong>${d.nome}</strong><br>${d.sistema}<br>Contribuzione totale: ${d.count} · Fattori collegati: ${d.factors.size}`
      tooltipEl.style.display = 'block'
    })
    node.on('pointermove', (e) => {
      tooltipEl.style.left = `${e.clientX + 14}px`
      tooltipEl.style.top = `${e.clientY - 10}px`
    })
    node.on('pointerout', () => {
      tooltipEl.style.display = 'none'
    })

    link.on('pointerover', (e, d) => {
      const list = d.factors.map((f) => `${f.nome} <em>(${COMP_LABEL[f.componente] || f.componente})</em>`).join('<br>')
      const s = typeof d.source === 'object' ? d.source.nome : d.source
      const t = typeof d.target === 'object' ? d.target.nome : d.target
      tooltipEl.innerHTML = `<strong>${s} ↔ ${t}</strong><br>${d.factors.length} fattori condivisi:<br>${list}`
      tooltipEl.style.display = 'block'
      d3.select(e.currentTarget).attr('stroke-opacity', 0.9)
    })
    link.on('pointermove', (e) => {
      tooltipEl.style.left = `${e.clientX + 14}px`
      tooltipEl.style.top = `${e.clientY - 10}px`
    })
    link.on('pointerout', (e) => {
      tooltipEl.style.display = 'none'
      d3.select(e.currentTarget).attr('stroke-opacity', 0.4)
    })

    simulation.on('tick', () => {
      nodes.forEach((n) => {
        const r = getS(n) / 2 + 4
        n.x = Math.max(r, Math.min(W - r, n.x))
        n.y = Math.max(r, Math.min(H - r, n.y))
      })
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
      simRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFNodes, rawFLinks])

  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current)
      .selectAll('g g')
      .attr('opacity', (d) => (!d ? 1 : sistemaFilter === 'all' || d.sistema === sistemaFilter ? 1 : 0.12))
  }, [sistemaFilter])

  if (!rawFNodes.length) {
    return <div className="empty">Nessun field con dati sufficienti per il grafo di correlazione.</div>
  }

  return (
    <>
      <svg ref={svgRef} id="graphsvg" height="400" viewBox={`0 0 ${W} ${H}`} />
      <div className="g-tooltip" ref={tooltipRef} />
      <div className="leg" style={{ marginTop: 10 }}>
        <div className="li">
          <LegendShape shape="rounded-rect" color={FIELD_COLOR} /> Impact field
        </div>
        <div style={{ marginLeft: 'auto' }}>dimensione = contribuzione totale del field · linea = n. fattori condivisi</div>
      </div>
    </>
  )
}

function FieldCorrelatiView({ rawNodes, sistemi, sistemaFilter, setSistemaFilter }) {
  return (
    <div className="card">
      <div className="ct">Field correlati</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
        Due field sono collegati se condividono almeno un fattore — passa il mouse su un arco per vedere quali.
      </div>
      <SistemaFilterRow sistemi={sistemi} value={sistemaFilter} onChange={setSistemaFilter} />
      <FieldFieldGraph rawNodes={rawNodes} sistemaFilter={sistemaFilter} />
    </div>
  )
}

// Vista "Classifica fattori" (punto 4, nuova): stessa aggregazione già
// calcolata per il grafo (quanti field/sistemi distinti tocca ciascun
// fattore), come tabella ordinabile invece che come rete — nessuna riga
// esclusa per pervasività (a differenza del grafo, una classifica perde
// senso se nasconde la parte bassa): il criterio field/sistemi del punto 2
// qui sceglie solo QUALE metrica mostrare/ordinare (N. field toccati o N.
// sistemi toccati), non se una riga compare. Il filtro sistema invece
// resta un filtro di riga: mostra solo i fattori collegati ad almeno un
// field di quel sistema (il conteggio mostrato resta quello globale, non
// ricalcolato sul sottoinsieme — coerente con "quanto è davvero pervasivo
// questo fattore", non con "quanto lo è dentro il sistema selezionato").
function FactorRankingTable({ rawNodes, sistemaFilter, pervasivenessMode }) {
  const [sortKey, setSortKey] = useState('metric')
  const [sortDir, setSortDir] = useState('desc')

  const rows = useMemo(() => {
    let list = rawNodes.filter((n) => n.type === 'factor')
    if (sistemaFilter !== 'all') list = list.filter((n) => n.sistemi.has(sistemaFilter))
    return list.map((n) => ({
      id: n.id,
      nome: n.nome,
      componente: n.componente,
      metric: pervasivenessMode === 'sistema' ? n.sistemi.size : n.fields.size,
      fields: [...n.fields].sort(),
    }))
  }, [rawNodes, sistemaFilter, pervasivenessMode])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'nome') return a.nome.localeCompare(b.nome) * dir
      if (sortKey === 'componente') return (COMP_LABEL[a.componente] || '').localeCompare(COMP_LABEL[b.componente] || '') * dir
      return (a.metric - b.metric) * dir
    })
  }, [rows, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'metric' ? 'desc' : 'asc')
    }
  }

  function arrow(key) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const metricLabel = pervasivenessMode === 'sistema' ? 'N. sistemi toccati' : 'N. field toccati'

  if (!sorted.length) {
    return <div className="empty">Nessun fattore trovato per questo filtro.</div>
  }

  return (
    <table className="hm-table">
      <thead>
        <tr>
          <th onClick={() => toggleSort('nome')} style={{ cursor: 'pointer', textAlign: 'left' }}>
            Fattore{arrow('nome')}
          </th>
          <th onClick={() => toggleSort('componente')} style={{ cursor: 'pointer' }}>
            Componente{arrow('componente')}
          </th>
          <th onClick={() => toggleSort('metric')} style={{ cursor: 'pointer' }}>
            {metricLabel}{arrow('metric')}
          </th>
          <th style={{ textAlign: 'left' }}>Field</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <td>{r.nome}</td>
            <td style={{ textAlign: 'center' }}>{COMP_LABEL[r.componente] || r.componente}</td>
            <td style={{ textAlign: 'center' }}>{r.metric}</td>
            <td title={r.fields.join(', ')}>
              {r.fields.length > 2 ? `${r.fields.slice(0, 2).join(', ')}, +${r.fields.length - 2}` : r.fields.join(', ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ClassificaView({ rawNodes, sistemi, sistemaFilter, setSistemaFilter, pervasivenessMode, setPervasivenessMode }) {
  return (
    <div className="card">
      <div className="ct">Classifica fattori</div>
      <SistemaFilterRow sistemi={sistemi} value={sistemaFilter} onChange={setSistemaFilter} />
      <PervasivenessModeToggle value={pervasivenessMode} onChange={setPervasivenessMode} />
      <div style={{ overflowX: 'auto' }}>
        <FactorRankingTable rawNodes={rawNodes} sistemaFilter={sistemaFilter} pervasivenessMode={pervasivenessMode} />
      </div>
    </div>
  )
}

const SUBVIEWS = [
  ['field', 'Fattori per field'],
  ['field-correlati', 'Field correlati'],
  ['classifica', 'Classifica fattori'],
]

// Pervasività (Tab.4, S7 + correzione simbologia/nuove viste 2026-07-13):
// tre sotto-viste che condividono lo stesso grafo bipartito
// fattore↔field costruito da buildGraph — "Fattori per field" (il grafo
// originale), "Field correlati" (proiezione field↔field) e "Classifica
// fattori" (stessa aggregazione, tabella invece che rete). Un unico
// componente perché la maggior parte dei dati/codice è condivisa
// (buildGraph, filtro sistema, criterio di pervasività), non tre file
// separati.
export default function PervasityGraph({ contributions }) {
  const [subView, setSubView] = useState('field')
  const [sistemaFilter, setSistemaFilter] = useState('all')
  const [fieldFilter, setFieldFilter] = useState('all')
  const [showAllFactors, setShowAllFactors] = useState(false)
  const [pervasivenessMode, setPervasivenessMode] = useState('field')

  const { nodes: rawNodes, links: rawLinks, sistemi } = useMemo(() => buildGraph(contributions), [contributions])
  const fieldNames = useMemo(
    () => [...new Set(rawNodes.filter((n) => n.type === 'field').map((n) => n.nome))].sort(),
    [rawNodes]
  )

  if (!contributions.length) {
    return <div className="empty">Nessun contributo disponibile per questo territorio.</div>
  }

  return (
    <>
      <div className="card">
        <div className="ct">Pervasività — fattori e field</div>
        <div className="g-filters">
          {SUBVIEWS.map(([id, label]) => (
            <button key={id} className={`g-fbtn${subView === id ? ' on' : ''}`} onClick={() => setSubView(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {subView === 'field' && (
        <FactorFieldGraph
          rawNodes={rawNodes}
          rawLinks={rawLinks}
          sistemi={sistemi}
          fieldNames={fieldNames}
          sistemaFilter={sistemaFilter}
          setSistemaFilter={setSistemaFilter}
          fieldFilter={fieldFilter}
          setFieldFilter={setFieldFilter}
          showAllFactors={showAllFactors}
          setShowAllFactors={setShowAllFactors}
          pervasivenessMode={pervasivenessMode}
          setPervasivenessMode={setPervasivenessMode}
        />
      )}
      {subView === 'field-correlati' && (
        <FieldCorrelatiView rawNodes={rawNodes} sistemi={sistemi} sistemaFilter={sistemaFilter} setSistemaFilter={setSistemaFilter} />
      )}
      {subView === 'classifica' && (
        <ClassificaView
          rawNodes={rawNodes}
          sistemi={sistemi}
          sistemaFilter={sistemaFilter}
          setSistemaFilter={setSistemaFilter}
          pervasivenessMode={pervasivenessMode}
          setPervasivenessMode={setPervasivenessMode}
        />
      )}
    </>
  )
}
