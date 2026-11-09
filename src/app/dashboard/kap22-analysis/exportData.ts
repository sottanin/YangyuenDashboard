import type { ExcelExportData } from '@/lib/reporting/exportExcel'

interface DailyExportPoint { date: string; totalTransactions: number; totalAmount: string }
interface RankingExportPoint { walletAddress: string; amount: string }
interface HistoryExportRow {
  txId: string; type: string; flow: string; fromHash: string; fromName: string | null
  toHash: string; toName: string | null; value: string; tokenSymbol: string
  timestamp: string; status: string | null
}

export function tokenCountExport(rows: DailyExportPoint[]): ExcelExportData {
  return { headers: ['Date', 'Total transactions'], rows: rows.map((row) => [row.date, row.totalTransactions]) }
}

export function tokenAmountExport(rows: DailyExportPoint[], symbol: string): ExcelExportData {
  return { headers: ['Date', `Total amount (${symbol})`], rows: rows.map((row) => [row.date, row.totalAmount]) }
}

export function tokenRankingExport(rows: RankingExportPoint[], metric: 'Received' | 'Balance', symbol: string): ExcelExportData {
  return { headers: ['Rank', 'Wallet', `${metric} (${symbol})`], rows: rows.slice(0, 10).map((row, index) => [index + 1, row.walletAddress, row.amount]) }
}

export function tokenHistoryExport(rows: HistoryExportRow[], timezone: string): ExcelExportData {
  const formatTime = new Intl.DateTimeFormat('th-TH', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })
  const address = (hash: string, name: string | null): string => name ? `${name} (${hash})` : hash
  return {
    headers: ['Transaction', 'Type', 'From', 'To', 'Amount', 'Time', 'Status'],
    rows: rows.map((row) => [`${row.txId}\n${row.flow.replaceAll('_', ' ')}`, row.type, address(row.fromHash, row.fromName), address(row.toHash, row.toName), `${row.value} ${row.tokenSymbol}`, formatTime.format(new Date(row.timestamp)), row.status ?? 'Unknown']),
  }
}
