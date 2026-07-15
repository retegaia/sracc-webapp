// Genera il file Word dell'export catene d'impatto (docx, 2026-07-10).
// Una tabella per gruppo (v. buildGroups in exportData.js), con bordi e
// intestazione colorata — non solo testo semplice, per restare leggibile
// come il documento originale PAC_Barigadu_Guilcer_Catene_Impatto_v5_REV.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  HeadingLevel,
  ShadingType,
  VerticalAlign,
} from 'docx'
import { PLACEHOLDER, NO_IMPATTI, LIBRARY_ONLY } from './exportData.js'

const HEADER_FILL = '1E4D2B'
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
const BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER }
const MUTED_COLOR = '999999'

function textCell(paragraphs, { header = false, width } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: header ? { fill: HEADER_FILL, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    borders: BORDERS,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: paragraphs,
  })
}

function line(text, { header = false, bold = false, italic = false, color } = {}) {
  return new Paragraph({
    children: [
      new TextRun({ text, bold: header || bold, italics: italic, color: header ? 'FFFFFF' : color, size: 18 }),
    ],
  })
}

function cell(lines, opts = {}) {
  const list = Array.isArray(lines) ? lines : [lines]
  return textCell(
    list.map((text) => line(text, opts)),
    opts
  )
}

function bulletLines(items, placeholder) {
  return items && items.length ? items.map((t) => `• ${t}`) : [placeholder]
}

// La colonna "Rischio atteso" include anche gli impatti testuali di
// libreria (v. exportData.js). Se la combinazione non ha ancora nessun
// contributo compilato, quegli impatti sono solo una previsione di
// libreria — vanno resi in corsivo grigio con un'etichetta esplicita,
// altrimenti la cella mostrerebbe testo pieno mentre le altre 3 colonne
// dicono "Nessun contributo": incoerenza segnalata da Andrea Vallebona il
// 2026-07-10 dopo la prima verifica in produzione (v. hasContribution).
function rischioCell(view, width) {
  const paragraphs = [line(view.rischioLivello ? `Rischio: ${view.rischioLivello}` : PLACEHOLDER)]
  if (view.impatti && view.impatti.length) {
    if (!view.hasContribution) paragraphs.push(line(LIBRARY_ONLY, { italic: true, color: MUTED_COLOR }))
    for (const impatto of view.impatti) {
      paragraphs.push(
        line(`• ${impatto}`, { italic: !view.hasContribution, color: !view.hasContribution ? MUTED_COLOR : undefined })
      )
    }
  } else {
    paragraphs.push(line(NO_IMPATTI))
  }
  return textCell(paragraphs, { width })
}

export async function generateWordBuffer(groups) {
  const children = [
    new Paragraph({ text: "Catene d'impatto climatico — export RADAPT Barigadu Guilcer", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: `Generato il ${new Date().toLocaleDateString('it-IT')}`, italics: true, size: 18 })],
      spacing: { after: 200 },
    }),
  ]

  for (const g of groups) {
    children.push(new Paragraph({ text: g.title, heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 120 } }))

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        cell(g.rowLabel, { header: true, width: 16 }),
        cell('Esposizione', { header: true, width: 20 }),
        cell('Sensibilità', { header: true, width: 20 }),
        cell('Capacità adattiva', { header: true, width: 20 }),
        cell('Rischio atteso', { header: true, width: 24 }),
      ],
    })

    const rows = g.items.map(
      (item) =>
        new TableRow({
          children: [
            cell(item.rowLabel, { width: 16, bold: true }),
            cell(bulletLines(item.view.esposizione, PLACEHOLDER), { width: 20 }),
            cell(bulletLines(item.view.sensibilita, PLACEHOLDER), { width: 20 }),
            cell(bulletLines(item.view.capacitaAdattiva, PLACEHOLDER), { width: 20 }),
            rischioCell(item.view, 24),
          ],
        })
    )

    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] }))
  }

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
