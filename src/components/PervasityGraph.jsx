import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'

const FC = { Esposizione: '#0C447C', Sensibilita: '#993C1D', 'Capacita adattiva': '#4A7C59' }
const COMP_LABEL = { Esposizione: 'Esposizione', Sensibilita: 'Sensibilità', 'Capacita adattiva': 'Capacità adattiva' }
const W = 680
const H = 400

// Costruisce il grafo bipartito fattore↔field dai contributi reali (non
// hardcoded come nel prototipo). Chiude la questione aperta B2 (§11, Tab.9)
// con l'encoding deciso da Andrea Vallebona il 2026-07-10: dimensione nodo
// fattore = contribuzione totale (stessa logica di PervasivityView, S4);
// spessore arco fattore→field = numero di contributi che li collegano
// (non "co-occorrenza tra coppie di fattori" in senso stretto — il grafo
// resta bipartito come nel prototipo, non un grafo di soli fattori: scelta
// confermata con Andrea il 2026-07-10); colore nodo fattore = componente.
function buildGraph(contributions) {
  const factors = new Map() // key: nome normalizzato -> { id, nome, componente, count, fields: Set }
  const fields = new Map() // key: nome field -> { id, nome, sistema, factors: Set }
  const edges = new Map() // key: `${factorKey}|||${fieldKey}` -> peso

  for (const c of contributions) {
    // Riga senza fattori (bozza mai iniziata, o scheda resettata) — ignorata
    // per non lasciare un nodo field isolato senza archi (v. BowTie.jsx).
    // Se un altro contributo reale tocca lo stesso field, il nodo viene
    // comunque creato da quella riga.
    if (!c.factors?.length) continue
    if (!fields.has(c.field)) fields.set(c.field, { id: c.field, nome: c.field, sistema: c.sistema, factors: new Set() })
    const fieldNode = fields.get(c.field)
    for (const f of c.factors) {
      const key = f.nome.trim().toLowerCase()
      if (!key) continue
      if (!factors.has(key)) factors.set(key, { id: key, nome: f.nome, componente: f.componente, strato: f.strato, count: 0, fields: new Set() })
      const factorNode = factors.get(key)
      factorNode.count++
      factorNode.fields.add(c.field)
      fieldNode.factors.add(key)
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

function arcPositions(ids, baseDeg, spreadDeg, cx, cy, arcR) {
  const base = (baseDeg * Math.PI) / 180
  const spread = (spreadDeg * Math.PI) / 180
  return ids.map((id, i) => {
    const t = ids.length === 1 ? 0 : i / (ids.length - 1) - 0.5
    const a = base + t * spread
    return { id, x: cx + arcR * Math.cos(a), y: cy + arcR * Math.sin(a) }
  })
}

const SISTEMA_COLORS = ['#534AB7', '#BA7517', '#0F6E56', '#A32D2D', '#2D7D7F']

// Grafo pervasività (Tab.4, S7): porta 1:1 lo stile visivo e le interazioni
// del prototipo docs/SRACC_Visualizzazioni.html (D3 force simulation, drag,
// tooltip on hover, filtro per sistema) — struttura bipartita
// fattore↔field confermata identica al prototipo, ma nodi/archi costruiti
// dai contributi reali invece dei FACTOR_NODES/FIELD_NODES/LINKS hardcoded.
export default function PervasityGraph({ contributions }) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)
  const simRef = useRef(null)
  const [filter, setFilter] = useState('all')
  // L'handler pointerout (dentro l'effect D3 sotto, che monta una sola volta
  // per dataset) deve leggere il filtro corrente, non quello catturato al
  // mount: senza il ref il filtro selezionato si "dimenticava" dopo il primo
  // hover, tornando a mostrare tutti i nodi a piena opacità.
  const filterRef = useRef(filter)
  filterRef.current = filter

  const { nodes: rawNodes, links: rawLinks, sistemi } = useMemo(() => buildGraph(contributions), [contributions])
  const sistemaColor = useMemo(() => {
    const m = new Map()
    sistemi.forEach((s, i) => m.set(s, SISTEMA_COLORS[i % SISTEMA_COLORS.length]))
    return m
  }, [sistemi])

  useEffect(() => {
    const svgEl = svgRef.current
    const tooltipEl = tooltipRef.current
    if (!svgEl || !rawNodes.length) return

    // Copie mutabili per la simulation (d3 vi scrive x/y/vx/vy/index)
    const nodes = rawNodes.map((n) => ({ ...n }))
    const links = rawLinks.map((l) => ({ ...l }))

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

    node
      .append('circle')
      .attr('r', getR)
      .attr('fill', (d) => (d.type === 'factor' ? FC[d.componente] || '#888' : sistemaColor.get(d.sistema) || '#888'))
      .attr('fill-opacity', 0.9)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', (d) => (d.type === 'factor' && d.strato === 'IN' ? '4,3' : null))

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
        html += `${COMP_LABEL[d.componente] || d.componente}${d.strato ? ` · ${d.strato === 'IN' ? 'Invariante' : d.strato === 'ST' ? 'Specificità' : 'Variabile'}` : ''}<br>Occorrenze: ${d.count} · Field collegati: ${d.fields.size}`
      } else {
        html += `${d.sistema}<br>Fattori pervasivi: ${d.factors.size}`
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
      const f = filterRef.current
      node.attr('opacity', (d) => (f === 'all' || d.type === 'factor' || d.sistema === f ? 1 : 0.12))
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
  }, [rawNodes, rawLinks, sistemi, sistemaColor])

  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current)
      .selectAll('g g')
      .attr('opacity', (d) => (!d ? 1 : filter === 'all' || d.type === 'factor' || d.sistema === filter ? 1 : 0.12))
  }, [filter])

  if (!contributions.length) {
    return <div className="empty">Nessun contributo disponibile per questo territorio.</div>
  }

  return (
    <div className="card">
      <div className="ct">Fattori × Impact field — pervasività</div>
      <div className="g-filters">
        <button className={`g-fbtn${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
          Tutti
        </button>
        {sistemi.map((s) => (
          <button key={s} className={`g-fbtn${filter === s ? ' on' : ''}`} onClick={() => setFilter(s)}>
            {s.split(' ')[0]}
          </button>
        ))}
      </div>
      <svg ref={svgRef} id="graphsvg" height="400" viewBox={`0 0 ${W} ${H}`} />
      <div className="g-tooltip" ref={tooltipRef} />
      <div className="leg" style={{ marginTop: 10 }}>
        <div className="li">
          <span className="ld" style={{ background: FC.Esposizione }} />
          Esposizione
        </div>
        <div className="li">
          <span className="ld" style={{ background: FC.Sensibilita }} />
          Sensibilità
        </div>
        <div className="li">
          <span className="ld" style={{ background: FC['Capacita adattiva'] }} />
          Cap. adattiva
        </div>
        {sistemi.map((s) => (
          <div className="li" key={s}>
            <span className="ld" style={{ background: sistemaColor.get(s) }} />
            {s.split(' ')[0]}
          </div>
        ))}
        <div style={{ marginLeft: 'auto' }}>○ = contribuzione totale · linea = n. contributi</div>
      </div>
    </div>
  )
}
