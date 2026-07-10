// Genera il file Excel dell'export catene d'impatto (exceljs, 2026-07-10).
// Un foglio per gruppo (v. buildGroups in exportData.js): i nomi foglio
// Excel sono limitati a 31 caratteri e non ammettono alcuni caratteri.
import ExcelJS from 'exceljs'
import { PLACEHOLDER, NO_IMPATTI, LIBRARY_ONLY } from './exportData.js'

const HEADER_FILL = 'FF1E4D2B'
const THIN = { style: 'thin', color: { argb: 'FFCCCCCC' } }
const CELL_BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const MUTED_COLOR = 'FF999999'
const SHEET_NAME_MAX = 31
const SEP = ' — '

function clean(s) {
  return s.replace(/[:\\/?*[\]]/g, '-')
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text
  return text.slice(0, Math.max(maxLen - 1, 1)) + '…'
}

// Tronca il nome foglio dando priorità al "distinguisher" (pericolo/field,
// ciò che varia da un foglio all'altro dello stesso sistema) rispetto al
// nome del sistema (che si ripete identico su più tavole) — altrimenti,
// troncando alla cieca la stringa già unita "sistema — distinguisher", più
// tavole dello stesso sistema collassano su nomi foglio indistinguibili
// ("Insediativo e delle Infrastrutt", "...Infrast (2)", "...Infrast (3)":
// bug trovato il 2026-07-10 durante la verifica in produzione). Tronca
// solo quanto serve a stare nel limite, non un budget fisso, così le
// combinazioni che già rientrano restano leggibili per intero.
function sanitizeSheetName(sistema, distinguisher, used) {
  sistema = clean(sistema)
  distinguisher = clean(distinguisher)
  const full = `${sistema}${SEP}${distinguisher}`
  let name = full
  if (full.length > SHEET_NAME_MAX) {
    const overflow = full.length - SHEET_NAME_MAX
    const sisLen = Math.max(sistema.length - overflow, 8)
    const sisTrunc = truncate(sistema, sisLen)
    const candidate = `${sisTrunc}${SEP}${distinguisher}`
    if (candidate.length <= SHEET_NAME_MAX) {
      name = candidate
    } else {
      const distBudget = SHEET_NAME_MAX - sisTrunc.length - SEP.length
      name = `${sisTrunc}${SEP}${truncate(distinguisher, distBudget)}`
    }
  }
  let suffix = 2
  while (used.has(name)) {
    const tag = ` (${suffix})`
    const budget = SHEET_NAME_MAX - tag.length
    name = (full.length > budget ? full.slice(0, budget) : full) + tag
    suffix += 1
  }
  used.add(name)
  return name
}

function joinLines(items, placeholder) {
  return items && items.length ? items.join('\n') : placeholder
}

export async function generateExcelBuffer(groups) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SRACC Barigadu Guilcer'
  wb.created = new Date()

  const usedNames = new Set()

  for (const g of groups) {
    const ws = wb.addWorksheet(sanitizeSheetName(g.sistema, g.distinguisher, usedNames))
    ws.columns = [
      { header: g.rowLabel, key: 'row', width: 26 },
      { header: 'Esposizione', key: 'esp', width: 34 },
      { header: 'Sensibilità', key: 'sen', width: 34 },
      { header: 'Capacità adattiva', key: 'cap', width: 34 },
      { header: 'Rischio atteso', key: 'ris', width: 20 },
      { header: 'Impatti attesi', key: 'imp', width: 40 },
    ]

    const headerRow = ws.getRow(1)
    headerRow.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      c.border = CELL_BORDER
      c.alignment = { vertical: 'middle', wrapText: true }
    })

    for (const item of g.items) {
      const v = item.view
      // Impatti attesi senza alcun contributo compilato sono solo una
      // previsione di libreria — etichetta esplicita + font in corsivo
      // grigio sulla cella, altrimenti "Impatti attesi" mostrerebbe testo
      // pieno mentre le altre 4 colonne dicono "Nessun contributo"
      // (incoerenza segnalata da Andrea Vallebona il 2026-07-10, v.
      // hasContribution in exportData.js).
      const libraryOnly = v.impatti && v.impatti.length && !v.hasContribution
      const impText = v.impatti && v.impatti.length ? [libraryOnly ? LIBRARY_ONLY : null, ...v.impatti].filter(Boolean).join('\n') : NO_IMPATTI

      const row = ws.addRow({
        row: item.rowLabel,
        esp: joinLines(v.esposizione, PLACEHOLDER),
        sen: joinLines(v.sensibilita, PLACEHOLDER),
        cap: joinLines(v.capacitaAdattiva, PLACEHOLDER),
        ris: v.rischioLivello || PLACEHOLDER,
        imp: impText,
      })
      row.eachCell((c) => {
        c.alignment = { wrapText: true, vertical: 'top' }
        c.border = CELL_BORDER
      })
      if (libraryOnly) row.getCell('imp').font = { italic: true, color: { argb: MUTED_COLOR } }
    }
  }

  return wb.xlsx.writeBuffer()
}
