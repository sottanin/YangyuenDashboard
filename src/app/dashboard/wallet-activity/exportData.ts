import type { ExcelExportData } from '@/lib/reporting/exportExcel'
import { calendarDays } from '@/lib/reporting/chartTimeline'

export interface WalletHistoryExportRow {
  txId: string; timestamp: string; fromHash: string; toHash: string
  fromName: string | null; toName: string | null; tokenName: string; tokenSymbol: string
  type: string; value: string; tokenId: string | null; tokenValue: string | null; status: string | null
}
export interface WalletFitivityExportRow { date: string; walletAddresses: string[]; metricType: string; value: string; unit: string }
export interface WalletTrendExportPoint { date: string; average: string; accumulated: string }
export type WalletExportKind = 'transaction' | 'redemption' | 'fitivity'

export function walletHistoryExport(rows: WalletHistoryExportRow[], kind: 'transaction' | 'redemption', timezone: string): ExcelExportData {
  const time = new Intl.DateTimeFormat('th-TH', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })
  const address = (hash: string, name: string | null): string => name ? `${name} (${hash})` : hash
  return {
    headers: kind === 'transaction' ? ['Transaction', 'Type', 'From', 'To', 'Token', 'Amount', 'Time', 'Status'] : ['Transaction', 'From', 'To', 'NFT', 'Token ID', 'Token Value', 'Amount', 'Time', 'Status'],
    rows: rows.map((row) => [row.txId, ...(kind === 'transaction' ? [row.type] : []), address(row.fromHash, row.fromName), address(row.toHash, row.toName), row.tokenName, ...(kind === 'redemption' ? [row.tokenId, row.tokenValue ?? '—'] : []), kind === 'redemption' ? '1 NFT' : `${row.value} ${row.tokenSymbol}`, time.format(new Date(row.timestamp)), row.status ?? 'Unknown']),
  }
}

export function walletFitivityHistoryExport(rows: WalletFitivityExportRow[]): ExcelExportData {
  return { headers: ['Date', 'Wallet Address', 'Metric', 'Value', 'Unit'], rows: rows.map((row) => [row.date, row.walletAddresses.length ? row.walletAddresses.join('\n') : 'ยังไม่ได้เชื่อมที่อยู่กระเป๋า', row.metricType, row.value, row.unit]) }
}

export function walletTrendExport(rows: WalletTrendExportPoint[], from: string, to: string, mode: 'daily' | 'cumulative', unit: string): ExcelExportData {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  return { headers: ['Date', `${mode === 'daily' ? 'ค่ารายวัน' : 'ยอดสะสม'} (${unit})`], rows: calendarDays(from, to).map((date) => { const point = byDate.get(date); return [date, point ? mode === 'daily' ? point.average : point.accumulated : null] }) }
}

export function walletMonthlyExport(rows: Array<{ month: string; total: number }>): ExcelExportData {
  return { headers: ['Month', 'Monthly transactions'], rows: rows.map((row) => [row.month, row.total]) }
}
