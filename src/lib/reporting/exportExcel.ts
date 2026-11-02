export type ExcelValue = string | number | null

export interface ExcelExportData {
  headers: string[]
  rows: ExcelValue[][]
}

// Excel stores only 15 significant digits. Keep longer decimals as text.
export function excelDecimal(value: string): ExcelValue {
  const significant = value.replace(/^-/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '')
  const number = Number(value)
  return /^-?\d+(\.\d+)?$/.test(value) && significant.length <= 15 && Number.isFinite(number) && Math.abs(number) < 1e15 ? number : value
}

export async function downloadExcel(data: ExcelExportData, filename: string): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.addRow(data.headers)
  for (const row of data.rows) sheet.addRow(row)
  sheet.getRow(1).font = { bold: true }
  sheet.columns.forEach((column, index) => {
    column.width = index === 0 ? 48 : Math.min(42, Math.max(18, data.headers[index].length + 2))
    column.alignment = { vertical: 'top', wrapText: true }
  })
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.rows.length + 1, column: data.headers.length } }
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')}.xlsx`
  document.body.appendChild(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
