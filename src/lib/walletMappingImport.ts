import ExcelJS from 'exceljs'

const HEADERS = ['User ID', 'Wallet Address'] as const
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const LEGACY_DELETED_USER = /^deleted_user_[A-Za-z0-9]+$/
export const MAX_WALLET_MAPPING_ROWS = 10_000

export interface ParsedWalletMapping {
  rowNumber: number
  userId: string
  normalizedUserId: string
  walletAddress: string
  normalizedWalletAddress: string
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) throw new Error(`Row ${cell.row}: formulas are not allowed`)
    if ('hyperlink' in value) throw new Error(`Row ${cell.row}: hyperlinks are not allowed`)
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim()
    throw new Error(`Row ${cell.row}: unsupported cell content`)
  }
  return String(value).trim()
}

export async function parseWalletMappingWorkbook(buffer: Buffer): Promise<ParsedWalletMapping[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  if (workbook.worksheets.length !== 1) throw new Error('The workbook must contain exactly one worksheet')
  const worksheet = workbook.worksheets[0]
  const firstHeader = cellText(worksheet.getCell(1, 1))
  const secondHeader = cellText(worksheet.getCell(1, 2))
  const extraHeader = Array.from({ length: Math.max(0, worksheet.actualColumnCount - 2) }, (_, index) => cellText(worksheet.getCell(1, index + 3))).find(Boolean) ?? ''
  if (firstHeader !== HEADERS[0] || secondHeader !== HEADERS[1] || extraHeader) {
    throw new Error(`Columns must match exactly: ${HEADERS.join(', ')}`)
  }

  const parsed: ParsedWalletMapping[] = []
  const seen = new Map<string, number>()
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const userId = cellText(row.getCell(1))
    const walletAddress = cellText(row.getCell(2))
    const extra = Array.from({ length: Math.max(0, worksheet.actualColumnCount - 2) }, (_, index) => cellText(row.getCell(index + 3))).find(Boolean) ?? ''
    if (!userId && !walletAddress && !extra) continue
    if (parsed.length >= MAX_WALLET_MAPPING_ROWS) throw new Error(`The workbook may contain at most ${MAX_WALLET_MAPPING_ROWS.toLocaleString()} data rows`)
    if (!userId || userId.length > 200) throw new Error(`Row ${rowNumber}: User ID is required and must not exceed 200 characters`)
    if (!walletAddress || walletAddress.length > 200 || (!EVM_ADDRESS.test(walletAddress) && !LEGACY_DELETED_USER.test(walletAddress))) {
      throw new Error(`Row ${rowNumber}: Wallet Address must be a valid EVM address or legacy deleted_user_* identifier`)
    }
    if (extra) throw new Error(`Row ${rowNumber}: only User ID and Wallet Address columns are allowed`)
    const normalizedUserId = userId.toLowerCase()
    const normalizedWalletAddress = walletAddress.toLowerCase()
    const key = `${normalizedUserId}\u0000${normalizedWalletAddress}`
    const duplicateRow = seen.get(key)
    if (duplicateRow !== undefined) throw new Error(`Row ${rowNumber}: duplicate mapping also appears on row ${duplicateRow}`)
    seen.set(key, rowNumber)
    parsed.push({ rowNumber, userId, normalizedUserId, walletAddress, normalizedWalletAddress })
  }
  if (parsed.length === 0) throw new Error('The workbook does not contain any data rows')
  return parsed
}

export function isEvmWalletAddress(value: string): boolean {
  return EVM_ADDRESS.test(value)
}
