/**
 * Turns BusinessReport sheet data into an .xlsx file. The exceljs module is passed in rather
 * than imported, so the ~1 MB library only loads when someone actually downloads a report
 * (and so tests can run this exact code in node).
 */
import type ExcelJSNamespace from 'exceljs'
import type { BusinessReport, CellFormat, ReportCell, ReportTable } from '@/lib/report'

type ExcelJS = typeof ExcelJSNamespace

const NUM_FMT: Record<CellFormat, string | undefined> = {
  text: undefined,
  naira: '"₦"#,##0',
  number: '#,##0',
  percent: '0.0%',
  date: 'dd mmm yyyy',
  datetime: 'dd mmm yyyy hh:mm',
}

const TEAL = 'FF0B3D3A'
const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE3F0EE' } }
const TOTAL_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF4EFE6' } }
const THIN = { style: 'thin' as const, color: { argb: 'FFE2DACA' } }

function unwrap(cell: ReportCell): { value: string | number | Date | null; format?: CellFormat } {
  if (cell !== null && typeof cell === 'object' && !(cell instanceof Date)) return cell
  return { value: cell }
}

function colLetter(index: number): string {
  let s = ''
  for (let i = index + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

export async function buildWorkbook(Excel: ExcelJS, report: BusinessReport): Promise<ArrayBuffer> {
  const wb = new Excel.Workbook()
  wb.creator = 'Crafty Cottage admin'
  wb.created = new Date()
  wb.title = `Crafty Cottage report, ${report.range.label}`

  for (const sheet of report.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31))
    // Widest column definition across this sheet's tables wins.
    const widths: number[] = []
    for (const t of sheet.tables) t.columns.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, c.width)))
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))

    let row = 1
    for (const [i, line] of (sheet.intro ?? []).entries()) {
      const cell = ws.getCell(row, 1)
      cell.value = line
      cell.font = i === 0 && sheet.name === 'Summary' ? { bold: true, size: 14, color: { argb: TEAL } } : { italic: true, color: { argb: 'FF3F4F4C' } }
      row += 1
    }
    if (sheet.intro?.length) row += 1

    // A single-table sheet gets a frozen header and a filter; stacked tables get neither.
    const singleTable = sheet.tables.length === 1
    for (const table of sheet.tables) {
      row = writeTable(ws, table, row, singleTable) + 1
    }
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

function writeTable(ws: ExcelJSNamespace.Worksheet, table: ReportTable, startRow: number, freeze: boolean): number {
  let row = startRow
  if (table.title) {
    const t = ws.getCell(row, 1)
    t.value = table.title
    t.font = { bold: true, size: 12, color: { argb: TEAL } }
    row += 1
  }

  const headerRow = row
  table.columns.forEach((col, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = col.header
    cell.font = { bold: true, color: { argb: TEAL } }
    cell.fill = HEADER_FILL
    cell.border = { bottom: THIN }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  row += 1

  if (table.rows.length === 0) {
    const cell = ws.getCell(row, 1)
    cell.value = table.emptyText ?? 'Nothing to show for this period.'
    cell.font = { italic: true, color: { argb: 'FF56625F' } }
    return row + 1
  }

  const writeCells = (cells: ReportCell[], bold = false) => {
    cells.forEach((raw, i) => {
      const { value, format } = unwrap(raw)
      const cell = ws.getCell(row, i + 1)
      cell.value = value === '' ? null : value
      const fmt = NUM_FMT[format ?? table.columns[i]?.format ?? 'text']
      if (fmt && value !== null && value !== '') cell.numFmt = fmt
      if (bold) {
        cell.font = { bold: true }
        cell.fill = TOTAL_FILL
        cell.border = { top: THIN }
      }
      if (typeof value === 'string' && value.length > 40) cell.alignment = { wrapText: true, vertical: 'top' }
    })
    row += 1
  }

  for (const r of table.rows) writeCells(r)
  const lastDataRow = row - 1
  if (table.totals) writeCells(table.totals, true)

  if (freeze) {
    ws.views = [{ state: 'frozen', ySplit: headerRow }]
    ws.autoFilter = { from: `A${headerRow}`, to: `${colLetter(table.columns.length - 1)}${lastDataRow}` }
  }
  return row
}

/** Saves the workbook in the browser. */
export function downloadBuffer(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before releasing the file.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
