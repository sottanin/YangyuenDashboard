import { getReportingConfig } from '@/lib/system/config'

export type ReportPeriod = 'all' | 'week' | 'month' | '3months' | 'year' | 'custom'

export interface ReportDateRange {
  start: Date
  end: Date
  from: string
  to: string
  period: ReportPeriod
}

export class ReportPeriodError extends Error {}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function dateKeyAtBangkok(value: Date): string {
  return new Date(value.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
}

export async function getReportDateBounds(): Promise<{ historyStart: string; today: string }> {
  const config = await getReportingConfig()
  return { historyStart: dateKeyAtBangkok(new Date(config.businessHistoryStart)), today: dateKeyAtBangkok(new Date()) }
}

function parseDateKey(value: string, label: string): Date {
  if (!DATE_PATTERN.test(value)) throw new ReportPeriodError(`${label} must use YYYY-MM-DD format`)
  const [year, month, day] = value.split('-').map(Number)
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  if (utcDate.getUTCFullYear() !== year || utcDate.getUTCMonth() !== month - 1 || utcDate.getUTCDate() !== day) {
    throw new ReportPeriodError(`${label} is not a valid date`)
  }
  return utcDate
}

function shiftDateKey(value: string, period: Exclude<ReportPeriod, 'all' | 'custom'>): string {
  const date = parseDateKey(value, 'Date')
  if (period === 'week') date.setUTCDate(date.getUTCDate() - 6)
  if (period === 'month' || period === '3months') {
    const originalDay = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() - (period === 'month' ? 1 : 3))
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(originalDay, lastDay))
  }
  if (period === 'year') {
    const originalMonth = date.getUTCMonth()
    date.setUTCFullYear(date.getUTCFullYear() - 1, originalMonth, 1)
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), originalMonth + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(Number(value.slice(-2)), lastDay))
  }
  return date.toISOString().slice(0, 10)
}

function bangkokMidnight(value: string): Date {
  return new Date(`${value}T00:00:00.000+07:00`)
}

export async function parseReportDateRange(params: URLSearchParams): Promise<ReportDateRange> {
  const config = await getReportingConfig()
  const historyStart = new Date(config.businessHistoryStart)
  const rawPeriod = params.get('period') ?? 'all'
  if (!['all', 'week', 'month', '3months', 'year', 'custom'].includes(rawPeriod)) throw new ReportPeriodError('Invalid period')
  const period = rawPeriod as ReportPeriod
  const today = dateKeyAtBangkok(new Date())
  const historyDate = dateKeyAtBangkok(historyStart)
  let from = historyDate
  let to = today

  if (period === 'custom') {
    from = params.get('from') ?? ''
    to = params.get('to') ?? ''
    parseDateKey(from, 'From date')
    parseDateKey(to, 'To date')
    if (from > to) throw new ReportPeriodError('From date must be on or before To date')
    if (to > today) throw new ReportPeriodError('To date cannot be in the future')
    if (from < historyDate) throw new ReportPeriodError('From date cannot be before the business history start')
  } else if (period !== 'all') {
    from = shiftDateKey(today, period)
    if (from < historyDate) from = historyDate
  }

  const requestedStart = bangkokMidnight(from)
  const start = period === 'all' || requestedStart < historyStart ? historyStart : requestedStart
  const end = bangkokMidnight(to)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start, end, from, to, period }
}

/** Equal-length prior calendar window; all-time and history-truncated baselines are unavailable. */
export async function getPreviousReportRange(range: ReportDateRange): Promise<ReportDateRange | null> {
  if (range.period === 'all') return null
  const config = await getReportingConfig()
  const duration = range.end.getTime() - range.start.getTime()
  const end = new Date(range.start)
  const start = new Date(end.getTime() - duration)
  if (start < new Date(config.businessHistoryStart)) return null
  return { start, end, from: dateKeyAtBangkok(start), to: dateKeyAtBangkok(new Date(end.getTime() - 1)), period: range.period }
}

export function compareReportValues(current: string, previous: string | null): { change: number | null; changeLabel: string } {
  if (previous === null) return { change: null, changeLabel: '' }
  const now = Number(current); const before = Number(previous)
  if (!Number.isFinite(now) || !Number.isFinite(before)) return { change: null, changeLabel: '' }
  return { change: before === 0 ? (now === 0 ? 0 : null) : Number(((now - before) / Math.abs(before) * 100).toFixed(1)), changeLabel: before === 0 && now !== 0 ? 'มีกิจกรรมใหม่เมื่อเทียบกับช่วงก่อนหน้า' : 'เทียบกับช่วงก่อนหน้าที่มีระยะเวลาเท่ากัน' }
}
