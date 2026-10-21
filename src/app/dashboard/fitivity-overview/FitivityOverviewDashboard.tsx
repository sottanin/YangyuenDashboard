'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { DualLineChart } from '@/components/charts/DualLineChart'
import { MetricDistributionChart, type MetricDistributionPoint } from '@/components/charts/MetricDistributionChart'
import { RankedMetricBarChart, type RankedMetricPoint } from '@/components/charts/RankedMetricBarChart'
import { PeriodFilter } from '@/components/reports/PeriodFilter'
import { Card } from '@/components/ui/Card'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { KpiTile } from '@/components/ui/KpiTile'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonKpi } from '@/components/ui/SkeletonCard'
import { useChartPermissions } from '@/lib/ChartPermissionContext'
import type { ReportPeriod } from '@/lib/reporting/reportPeriod'
import { useWorkspace } from '@/lib/WorkspaceContext'

interface KpiMetric { total: string; average: string; users: number }
interface TrendPoint { date: string; average: string; accumulated: string }
interface UserSummaryRow { userId: string; totalSteps: string; averageSteps: string; totalCalories: string; averageCalories: string; totalSleep: string; averageSleep: string }
interface Report {
  workspace: { id: number; name: string }
  period: { from: string; to: string; historyStart: string; today: string }
  kpis: { steps: KpiMetric | null; calories: KpiMetric | null; sleep: KpiMetric | null }
  trends: { steps: TrendPoint[]; calories: TrendPoint[]; sleep: TrendPoint[] }
  topUsers: { steps: RankedMetricPoint[]; calories: RankedMetricPoint[]; sleep: RankedMetricPoint[] }
  distributions: { steps: MetricDistributionPoint[]; calories: MetricDistributionPoint[]; sleep: MetricDistributionPoint[] }
  userSummary: UserSummaryRow[]
}

const metricConfig = {
  steps: { title: 'Average Steps Per Day', primary: 'ค่าเฉลี่ยรายวัน', secondary: 'จำนวนก้าวสะสม', unit: 'steps', color: 'var(--success)', lightColor: '#86EFAC', digits: 0 },
  calories: { title: 'Average Calories Burn Per Day', primary: 'ค่าเฉลี่ยรายวัน', secondary: 'แคลอรีสะสม', unit: 'kcal', color: 'var(--warn)', lightColor: '#FDBA74', digits: 2 },
  sleep: { title: 'Average Sleep Hour Per Day', primary: 'ค่าเฉลี่ยรายวัน', secondary: 'ชั่วโมงสะสม', unit: 'hours', color: 'var(--accent)', lightColor: '#C4B5FD', digits: 2 },
} as const

function format(value: string, maximumFractionDigits: number): string {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits }) : value
}

function todayInBangkok(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

function compareDecimalStrings(left: string, right: string): number {
  const normalize = (value: string): { negative: boolean; integer: string; fraction: string } => {
    const negative = value.startsWith('-')
    const [rawInteger = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.')
    return { negative, integer: rawInteger.replace(/^0+(?=\d)/, ''), fraction: fraction.replace(/0+$/, '') }
  }
  const a = normalize(left); const b = normalize(right)
  if (a.negative !== b.negative) return a.negative ? -1 : 1
  const direction = a.negative ? -1 : 1
  if (a.integer.length !== b.integer.length) return (a.integer.length - b.integer.length) * direction
  const integerComparison = a.integer.localeCompare(b.integer)
  if (integerComparison !== 0) return integerComparison * direction
  const fractionLength = Math.max(a.fraction.length, b.fraction.length)
  return a.fraction.padEnd(fractionLength, '0').localeCompare(b.fraction.padEnd(fractionLength, '0')) * direction
}

export function FitivityOverviewDashboard(): React.JSX.Element {
  const { selected, loading: workspaceLoading } = useWorkspace()
  const { canViewChart } = useChartPermissions()
  const visible = {
    totalSteps: canViewChart('fitivity.total-steps'), totalCalories: canViewChart('fitivity.total-calories'), totalSleep: canViewChart('fitivity.total-sleep'),
    stepsTrend: canViewChart('fitivity.steps-trend'), caloriesTrend: canViewChart('fitivity.calories-trend'), sleepTrend: canViewChart('fitivity.sleep-trend'),
    topSteps: canViewChart('fitivity.top-steps'), topCalories: canViewChart('fitivity.top-calories'), topSleep: canViewChart('fitivity.top-sleep'),
    stepsDistribution: canViewChart('fitivity.steps-distribution'), caloriesDistribution: canViewChart('fitivity.calories-distribution'), sleepDistribution: canViewChart('fitivity.sleep-distribution'),
    userSummary: canViewChart('fitivity.user-summary'),
  }
  const hasVisibleContent = Object.values(visible).some(Boolean)
  const [period, setPeriod] = useState<ReportPeriod>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [historyStart, setHistoryStart] = useState('')
  const [today, setToday] = useState(todayInBangkok)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const customError = period === 'custom' ? (!customFrom || !customTo ? 'Select both From and To dates.' : customFrom > customTo ? 'From date must be on or before To date.' : customTo > today ? 'To date cannot be in the future.' : historyStart && customFrom < historyStart ? 'From date cannot be before the business history start.' : '') : ''

  useEffect(() => {
    if (workspaceLoading || selected.id === 'all' || !hasVisibleContent || customError) return
    const controller = new AbortController()
    const currentRequest = ++requestId.current
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setError(''); setReport(null) } })
    const query = new URLSearchParams({ workspace: String(selected.id), period })
    if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) }
    fetch(`/api/reports/fitivity/overview?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => { const body = await response.json() as Report & { error?: string }; if (!response.ok) throw new Error(body.error ?? 'Unable to load Fitivity overview'); return body })
      .then((body) => { if (!controller.signal.aborted && currentRequest === requestId.current) { setReport(body); setHistoryStart(body.period.historyStart); setToday(body.period.today) } })
      .catch((reason: unknown) => { if (!controller.signal.aborted && currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : 'Unable to load Fitivity overview') })
      .finally(() => { if (!controller.signal.aborted && currentRequest === requestId.current) setLoading(false) })
    return () => controller.abort()
  }, [customError, customFrom, customTo, hasVisibleContent, period, selected.id, workspaceLoading])

  return <div className="min-w-0 max-w-full">
    <PageHeader title="Fitivity Overview" subtitle={`ภาพรวมข้อมูลสุขภาพและกิจกรรม · ${selected.name}`} actions={hasVisibleContent ? <PeriodFilter idPrefix="fitivity-overview" period={period} customFrom={customFrom} customTo={customTo} minDate={historyStart} maxDate={today} disabled={workspaceLoading} onPeriodChange={setPeriod} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} /> : undefined} />
    {customError ? <div className="mb-4"><ErrorCard message={customError} /></div> : null}
    {error ? <div className="mb-4"><ErrorCard message={error} /></div> : null}
    {!hasVisibleContent ? <section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-default px-6 py-12 text-center"><h2 className="text-base font-semibold text-default">No report content available</h2><p className="mt-2 max-w-md text-sm text-muted">Your role allows access to this menu, but no Fitivity charts are assigned.</p></section> : null}
    {hasVisibleContent && (loading || !report) && !customError && !error ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <SkeletonKpi key={index} />)}</div> : null}
    {report && !customError ? <>
      {(visible.totalSteps || visible.totalCalories || visible.totalSleep) ? <section className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Fitivity key metrics">
        {visible.totalSteps && report.kpis.steps ? <KpiTile label="Total Steps" value={`${format(report.kpis.steps.total, 0)} steps`} subLabel={`${report.kpis.steps.users.toLocaleString()} users`} icon="steps" iconBg="rgb(var(--success) / 0.12)" iconColor="rgb(var(--success))" sparkColor="var(--success)" /> : null}
        {visible.totalCalories && report.kpis.calories ? <KpiTile label="Total Calories Burn" value={`${format(report.kpis.calories.total, 2)} kcal`} subLabel={`${report.kpis.calories.users.toLocaleString()} users`} icon="flame" iconBg="rgb(var(--warn) / 0.14)" iconColor="rgb(var(--warn))" sparkColor="var(--warn)" /> : null}
        {visible.totalSleep && report.kpis.sleep ? <KpiTile label="Total Sleep Hour" value={`${format(report.kpis.sleep.total, 2)} hours`} subLabel={`${report.kpis.sleep.users.toLocaleString()} users`} icon="sleep" iconBg="rgb(var(--accent) / 0.14)" iconColor="rgb(var(--accent))" sparkColor="var(--accent)" /> : null}
      </section> : null}
      <section className="mb-4 grid gap-4 xl:grid-cols-3" aria-label="Fitivity daily trends">
        {visible.stepsTrend ? <TrendCard metric="steps" data={report.trends.steps} /> : null}
        {visible.caloriesTrend ? <TrendCard metric="calories" data={report.trends.calories} /> : null}
        {visible.sleepTrend ? <TrendCard metric="sleep" data={report.trends.sleep} /> : null}
      </section>
      <section className="mb-4 grid gap-4 xl:grid-cols-3" aria-label="Fitivity user distributions">
        {visible.stepsDistribution ? <DistributionCard title="Users by Average Daily Steps" data={report.distributions.steps} color="var(--success)" /> : null}
        {visible.caloriesDistribution ? <DistributionCard title="Users by Average Daily Calories Burn" data={report.distributions.calories} color="var(--warn)" /> : null}
        {visible.sleepDistribution ? <DistributionCard title="Users by Average Daily Sleep Hour" data={report.distributions.sleep} color="var(--accent)" /> : null}
      </section>
      <section className="grid gap-4 xl:grid-cols-3" aria-label="Top Fitivity users">
        {visible.topSteps ? <RankCard title="Top 10 Users by Steps" data={report.topUsers.steps} unit="steps" color="var(--success)" digits={0} /> : null}
        {visible.topCalories ? <RankCard title="Top 10 Users by Calories Burn" data={report.topUsers.calories} unit="kcal" color="var(--warn)" digits={2} /> : null}
        {visible.topSleep ? <RankCard title="Top 10 Users by Sleep Hour" data={report.topUsers.sleep} unit="hours" color="var(--accent)" digits={2} /> : null}
      </section>
      {visible.userSummary ? <UserSummaryTable rows={report.userSummary} /> : null}
    </> : null}
  </div>
}

function TrendCard({ metric, data }: { metric: keyof typeof metricConfig; data: TrendPoint[] }): React.JSX.Element {
  const config = metricConfig[metric]
  const points = data.map((point) => ({ label: point.date, primary: Number(point.average), secondary: Number(point.accumulated) }))
  const periodAverage = points.length ? points.reduce((sum, point) => sum + point.primary, 0) / points.length : undefined
  return <Card title={config.title} subtitle="แสดงค่าเฉลี่ยต่อผู้ใช้งานที่มีกิจกรรมและยอดสะสมตามช่วงเวลาที่เลือก">{data.length ? <DualLineChart data={points} primaryLabel={config.primary} secondaryLabel={config.secondary} primaryTooltipUnit={config.unit} secondaryTooltipUnit={config.unit} primaryColor={config.color} secondaryColor={config.lightColor} primaryFractionDigits={config.digits} secondaryFractionDigits={config.digits} referenceValue={periodAverage} referenceLabel="ค่าเฉลี่ยของช่วงเวลา" referenceUnit={config.unit} height={290} /> : <Empty label="ไม่พบข้อมูลกิจกรรมในช่วงเวลานี้" />}</Card>
}

function DistributionCard({ title, data, color }: { title: string; data: MetricDistributionPoint[]; color: string }): React.JSX.Element {
  const hasUsers = data.some((point) => point.count > 0)
  return <Card title={title} subtitle="แบ่งกลุ่มผู้ใช้งานตามค่าเฉลี่ยต่อวันจากวันที่มีข้อมูลในช่วงเวลาที่เลือก">{hasUsers ? <MetricDistributionChart data={data} color={color} ariaLabel={title} /> : <Empty label="ไม่พบข้อมูลผู้ใช้งานในช่วงเวลานี้" />}</Card>
}

function RankCard({ title, data, unit, color, digits }: { title: string; data: RankedMetricPoint[]; unit: string; color: string; digits: number }): React.JSX.Element {
  return <Card title={title} subtitle="จัดอันดับผู้ใช้งานตามผลรวมในช่วงเวลาที่เลือก">{data.length ? <RankedMetricBarChart data={data} unit={unit} color={color} ariaLabel={title} maximumFractionDigits={digits} /> : <Empty label="ไม่พบข้อมูลผู้ใช้งานในช่วงเวลานี้" />}</Card>
}

type SummarySortKey = keyof UserSummaryRow

const summaryColumns: Array<{ key: SummarySortKey; label: string; unit?: string; digits: number }> = [
  { key: 'userId', label: 'User ID', digits: 0 },
  { key: 'totalSteps', label: 'Total Steps', unit: 'steps', digits: 0 },
  { key: 'averageSteps', label: 'Avg. Steps / Day', unit: 'steps', digits: 0 },
  { key: 'totalCalories', label: 'Total Calories Burn', unit: 'kcal', digits: 2 },
  { key: 'averageCalories', label: 'Avg. Calories / Day', unit: 'kcal', digits: 2 },
  { key: 'totalSleep', label: 'Total Sleep', unit: 'hours', digits: 2 },
  { key: 'averageSleep', label: 'Avg. Sleep / Day', unit: 'hours', digits: 2 },
]

function UserSummaryTable({ rows }: { rows: UserSummaryRow[] }): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SummarySortKey>('userId')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const comparison = sortKey === 'userId'
      ? left.userId.localeCompare(right.userId, undefined, { numeric: true, sensitivity: 'base' })
      : compareDecimalStrings(left[sortKey], right[sortKey])
    return sortDirection === 'asc' ? comparison : -comparison
  }), [rows, sortDirection, sortKey])
  const changeSort = (key: SummarySortKey): void => {
    if (key === sortKey) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection(key === 'userId' ? 'asc' : 'desc') }
  }
  return <Card className="mt-4" title="User Summary" subtitle={`สรุปข้อมูลผู้ใช้งาน ${rows.length.toLocaleString()} คนในช่วงเวลาที่เลือก`} noPad>
    {rows.length === 0 ? <div className="py-16 text-center text-sm text-muted">ไม่พบข้อมูลผู้ใช้งานในช่วงเวลานี้</div> : <div className="max-h-[620px] overflow-auto thin-scroll">
      <table className="min-w-[1120px] w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[rgb(var(--surface))]"><tr className="border-b border-default text-[10.5px] uppercase tracking-wider text-faint">
          {summaryColumns.map((column) => <th key={column.key} className={`px-4 py-3 font-medium ${column.key === 'userId' ? 'text-left' : 'text-right'}`} aria-sort={sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className={`inline-flex w-full min-h-8 items-center gap-1 hover:text-default ${column.key === 'userId' ? 'justify-start' : 'justify-end'}`} onClick={() => changeSort(column.key)}>{column.label}<span aria-hidden="true">{sortKey === column.key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span></button>
          </th>)}
        </tr></thead>
        <tbody>{sortedRows.map((row) => <tr key={row.userId} className="tbl-row border-b border-default last:border-0">
          {summaryColumns.map((column) => <td key={column.key} className={`whitespace-nowrap px-4 py-3 ${column.key === 'userId' ? 'font-mono text-left text-xs text-default' : 'text-right font-mono text-xs text-muted'}`}>{column.key === 'userId' ? row.userId : `${format(row[column.key], column.digits)} ${column.unit}`}</td>)}
        </tr>)}</tbody>
      </table>
    </div>}
  </Card>
}

function Empty({ label }: { label: string }): React.JSX.Element {
  return <div className="flex h-[290px] items-center justify-center text-sm text-muted">{label}</div>
}
