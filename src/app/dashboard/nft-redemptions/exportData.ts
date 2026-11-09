import type { ExcelExportData } from '@/lib/reporting/exportExcel'

export interface NftHistoryExportRow {
  txId: string
  timestamp: string
  type: string
  status: string | null
  tokenName: string
  tokenSymbol: string
  tokenId: string | null
  tokenValue: string | null
  fromHash: string
  fromName: string | null
  toHash: string
  toName: string | null
}

export function nftTrendExport(rows: Array<{ label: string; issued?: number; used?: number }>, issued: boolean, used: boolean): ExcelExportData {
  return {
    headers: ['Date', ...(issued ? ['Issued'] : []), ...(used ? ['Used'] : [])],
    rows: rows.map((row) => [row.label, ...(issued ? [row.issued ?? 0] : []), ...(used ? [row.used ?? 0] : [])]),
  }
}

export function nftRankingExport(rows: Array<{ name: string; total: number }>, metric: 'Issued' | 'Used'): ExcelExportData {
  return { headers: ['Rank', 'NFT', metric], rows: rows.map((row, index) => [index + 1, row.name, row.total]) }
}

export function nftHistoryExport(rows: NftHistoryExportRow[], timezone: string): ExcelExportData {
  const timestamp = new Intl.DateTimeFormat('th-TH', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })
  const address = (hash: string, name: string | null): string => name ? `${name} (${hash})` : hash
  return {
    headers: ['Transaction', 'Type', 'From', 'To', 'NFT', 'Token ID', 'Token Value', 'Amount', 'Time', 'Status'],
    rows: rows.map((row) => [row.txId, row.type, address(row.fromHash, row.fromName), address(row.toHash, row.toName), row.tokenSymbol ? `${row.tokenName} (${row.tokenSymbol})` : row.tokenName, row.tokenId ?? '—', row.tokenValue ?? '—', '1 NFT', timestamp.format(new Date(row.timestamp)), row.status ?? 'Unknown']),
  }
}
