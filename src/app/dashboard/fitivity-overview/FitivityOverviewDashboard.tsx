'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SingleLineChart } from '@/components/charts/SingleLineChart'
import { calendarDays } from '@/lib/reporting/chartTimeline'
import { ReportScope } from '@/components/reports/ReportScope'
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

interface KpiMetric { total: string; average: string | null; users: number; personDays: number; daysReported: number; coverage: number | null; previousAverage: string | null; change: number | null }
interface TrendPoint { date: string; average: string; accumulated: string; users: number }
interface UserSummaryRow { userId: string; walletAddress: string; wallets: string[]; stepsDays: number; caloriesDays: number; sleepDays: number; totalSteps: string; averageSteps: string; totalCalories: string; averageCalories: string; totalSleep: string; averageSleep: string }
interface Report {
  workspace: { id: number; name: string }
  dataThrough: string | null
  previousPeriod: { from: string; to: string } | null
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
  const customError = period === 'custom' ? (!customFrom || !customTo ? 'กรุณาเลือกวันเริ่มต้นและวันสิ้นสุด' : customFrom > customTo ? 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด' : customTo > today ? 'วันสิ้นสุดต้องไม่เกินวันนี้' : historyStart && customFrom < historyStart ? 'From date cannot be before the business history start.' : '') : ''

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
    {!hasVisibleContent ? <section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-default px-6 py-12 text-center"><h2 className="text-base font-semibold text-default">ยังไม่มีรายงานให้แสดง</h2><p className="mt-2 max-w-md text-sm text-muted">คุณเปิดเมนูนี้ได้ แต่ยังไม่ได้รับสิทธิ์ดูข้อมูล Fitivity</p></section> : null}
    {hasVisibleContent && (loading || !report) && !customError && !error ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <SkeletonKpi key={index} />)}</div> : null}
    {report && !customError ? <>
      <ReportScope from={report.period.from} to={report.period.to} dataThrough={report.dataThrough} comparisonNote={report.previousPeriod ? `ค่าเฉลี่ยรายวันเทียบกับช่วง ${report.previousPeriod.from} ถึง ${report.previousPeriod.to} ข้อมูลของช่วงปัจจุบันอาจยังไม่ครบ` : 'ยังไม่มีข้อมูลช่วงก่อนหน้าที่นำมาเทียบได้สำหรับช่วงที่เลือก'} scopeNote="ค่าเฉลี่ยใช้เฉพาะวันที่มีรายงานของแต่ละคน สัดส่วนวันที่มีข้อมูลเทียบกับจำนวนวันทั้งหมดของผู้ที่มีรายงานในช่วงนี้ ไม่ใช่สัดส่วนของสมาชิกทั้ง Workspace" />
      {(visible.totalSteps || visible.totalCalories || visible.totalSleep) ? <section className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Fitivity key metrics">
        {visible.totalSteps && report.kpis.steps ? <PerformanceKpi metric="steps" value={report.kpis.steps} /> : null}
        {visible.totalCalories && report.kpis.calories ? <PerformanceKpi metric="calories" value={report.kpis.calories} /> : null}
        {visible.totalSleep && report.kpis.sleep ? <PerformanceKpi metric="sleep" value={report.kpis.sleep} /> : null}
      </section> : null}
      <section className="mb-4 grid gap-4 lg:grid-cols-2" aria-label="Fitivity daily trends">
        {visible.stepsTrend ? <TrendCard metric="steps" data={report.trends.steps} from={report.period.from} to={report.period.to} /> : null}
        {visible.caloriesTrend ? <TrendCard metric="calories" data={report.trends.calories} from={report.period.from} to={report.period.to} /> : null}
        {visible.sleepTrend ? <TrendCard metric="sleep" data={report.trends.sleep} from={report.period.from} to={report.period.to} /> : null}
      </section>
      <section className="mb-4 grid gap-4 xl:grid-cols-3" aria-label="Fitivity user distributions">
        {visible.stepsDistribution ? <DistributionCard title="Users by Average Daily Steps" data={report.distributions.steps} color="var(--success)" /> : null}
        {visible.caloriesDistribution ? <DistributionCard title="Users by Average Daily Calories Burn" data={report.distributions.calories} color="var(--warn)" /> : null}
        {visible.sleepDistribution ? <DistributionCard title="Users by Average Daily Sleep Hour" data={report.distributions.sleep} color="var(--accent)" /> : null}
      </section>
      <section className="grid gap-4 xl:grid-cols-3" aria-label="Top Fitivity users">
        {visible.topSteps ? <RankCard title="Highest recorded daily steps" data={report.topUsers.steps} unit="steps" color="var(--success)" digits={0} period={period} from={customFrom} to={customTo} /> : null}
        {visible.topCalories ? <RankCard title="Highest recorded daily active calories" data={report.topUsers.calories} unit="kcal" color="var(--warn)" digits={2} period={period} from={customFrom} to={customTo} /> : null}
        {visible.topSleep ? <RankCard title="Highest recorded daily sleep duration" data={report.topUsers.sleep} unit="hours" color="var(--accent)" digits={2} period={period} from={customFrom} to={customTo} /> : null}
      </section>
      {visible.userSummary ? <UserSummaryTable key={`${selected.id}:${period}:${customFrom}:${customTo}`} rows={report.userSummary} workspace={selected.id} period={period} from={customFrom} to={customTo} /> : null}
    </> : null}
  </div>
}

function PerformanceKpi({ metric, value }: { metric: keyof typeof metricConfig; value: KpiMetric }): React.JSX.Element {
  const config = metricConfig[metric]
  const icons = { steps: 'steps', calories: 'flame', sleep: 'sleep' }
  const titles = { steps: 'Daily steps per reporting participant', calories: 'Daily active calories per reporting participant', sleep: 'Daily sleep per reporting participant' }
  const changeLabel = value.change !== null ? 'เทียบกับช่วงก่อนหน้า' : value.previousAverage === '0' && value.average !== null && Number(value.average) > 0 ? 'มีข้อมูลกิจกรรมใหม่เมื่อเทียบกับช่วงก่อนหน้า' : undefined
  return <KpiTile label={titles[metric]} value={value.average === null ? '—' : `${format(value.average, config.digits)} ${config.unit}`} subLabel={`ผู้มีข้อมูล ${value.users.toLocaleString()} คน · มีรายงานจากผู้ใช้รวม ${value.personDays.toLocaleString()} วัน · ${value.coverage === null ? 'ยังไม่มีข้อมูลเพียงพอสำหรับคำนวณสัดส่วน' : `มีข้อมูล ${value.coverage}% ของวันที่นำมาคำนวณ`} · ยอดรวม ${format(value.total, config.digits)} ${config.unit}${value.previousAverage === null ? ' · ยังไม่มีค่าเฉลี่ยช่วงก่อนหน้า' : ` · ค่าเฉลี่ยรายวันช่วงก่อนหน้า ${format(value.previousAverage, config.digits)} ${config.unit}`}`} change={value.change} changeLabel={changeLabel} changeTone="neutral" icon={icons[metric]} />
}

function TrendCard({ metric, data, from, to }: { metric: keyof typeof metricConfig; data: TrendPoint[]; from: string; to: string }): React.JSX.Element {
  const [mode, setMode] = useState<'daily' | 'rolling' | 'cumulative'>('daily')
  const config = metricConfig[metric]
  const byDate = new Map(data.map((point) => [point.date, point]))
  const dates = calendarDays(from, to)
  const points = dates.map((date, index) => {
    const point = byDate.get(date)
    const windowPoints = dates.slice(Math.max(0, index - 6), index + 1).flatMap((day) => { const value = byDate.get(day); return value ? [value] : [] })
    const participants = windowPoints.reduce((total, value) => total + value.users, 0)
    const rolling = participants ? windowPoints.reduce((total, value) => total + Number(value.average) * value.users, 0) / participants : null
    return { label: date, value: !point ? null : mode === 'daily' ? Number(point.average) : mode === 'cumulative' ? Number(point.accumulated) : rolling, detail: point ? `ผู้มีรายงาน ${point.users.toLocaleString()} คน${mode === 'rolling' ? ` · รวม ${participants.toLocaleString()} วันที่มีรายงานจากผู้ใช้ใน 7 วันล่าสุด` : ''}` : 'ยังไม่มีรายงานในวันนี้ ไม่ได้หมายถึงค่าศูนย์' }
  })
  const personDays = data.reduce((total, point) => total + point.users, 0)
  const mean = personDays ? data.reduce((total, point) => total + Number(point.average) * point.users, 0) / personDays : undefined
  const labels = { daily: 'ค่าเฉลี่ยรายวัน', rolling: 'ค่าเฉลี่ย 7 วัน', cumulative: 'ยอดสะสมจากข้อมูลที่มี' }
  const cumulativeTitles = { steps: 'Recorded steps · cumulative', calories: 'Recorded active calories · cumulative', sleep: 'Recorded sleep hours · cumulative' }
  return <Card title={mode === 'cumulative' ? cumulativeTitles[metric] : mode === 'rolling' ? `${config.title} · เฉลี่ย 7 วันล่าสุด` : config.title} subtitle="ใช้เฉพาะวันที่มีรายงาน · ช่องว่างหมายถึงไม่มีข้อมูล ไม่ใช่ศูนย์">
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={`${config.title} display mode`}>{(['daily', 'rolling', 'cumulative'] as const).map((value) => <button key={value} type="button" className={`btn min-h-11 text-xs ${mode === value ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={mode === value} onClick={() => setMode(value)}>{labels[value]}</button>)}</div>
    {data.length ? <SingleLineChart data={points} label={labels[mode]} tooltipUnit={config.unit} color={config.color} fractionDigits={config.digits} showAverage={mode === 'daily'} referenceValue={mean} referenceLabel="ค่าเฉลี่ยจากวันที่มีรายงานของแต่ละคน" height={280} /> : <Empty label="ไม่พบข้อมูลกิจกรรมในช่วงเวลานี้" />}
  </Card>
}

function DistributionCard({ title, data, color }: { title: string; data: MetricDistributionPoint[]; color: string }): React.JSX.Element {
  const hasUsers = data.some((point) => point.count > 0)
  return <Card title={title} subtitle="แบ่งกลุ่มผู้ใช้งานตามค่าเฉลี่ยต่อวันจากวันที่มีข้อมูลในช่วงเวลาที่เลือก">{hasUsers ? <MetricDistributionChart data={data} color={color} ariaLabel={title} /> : <Empty label="ไม่พบข้อมูลผู้ใช้งานในช่วงเวลานี้" />}</Card>
}

function RankCard({ title, data, unit, color, digits, period, from, to }: { title: string; data: RankedMetricPoint[]; unit: string; color: string; digits: number; period: ReportPeriod; from: string; to: string }): React.JSX.Element {
  return <Card title={title} subtitle="เรียงตามค่าเฉลี่ยต่อวันที่มีรายงาน พร้อมจำนวนวัน · ไม่ใช่การประเมินสุขภาพ">{data.length ? <RankedMetricBarChart data={data} unit={unit} color={color} ariaLabel={title} maximumFractionDigits={digits} drilldownPeriod={period} drilldownFrom={from} drilldownTo={to} /> : <Empty label="ไม่พบข้อมูลผู้ใช้งานในช่วงเวลานี้" />}</Card>
}

type SummarySortKey = 'walletAddress' | 'totalSteps' | 'averageSteps' | 'totalCalories' | 'averageCalories' | 'totalSleep' | 'averageSleep'

const summaryColumns: Array<{ key: SummarySortKey; label: string; unit?: string; digits: number }> = [
  { key: 'walletAddress', label: 'Wallet Address', digits: 0 },
  { key: 'totalSteps', label: 'Total Steps', unit: 'steps', digits: 0 },
  { key: 'averageSteps', label: 'Avg. Steps / Day', unit: 'steps', digits: 0 },
  { key: 'totalCalories', label: 'Total Calories Burn', unit: 'kcal', digits: 2 },
  { key: 'averageCalories', label: 'Avg. Calories / Day', unit: 'kcal', digits: 2 },
  { key: 'totalSleep', label: 'Total Sleep', unit: 'hours', digits: 2 },
  { key: 'averageSleep', label: 'Avg. Sleep / Day', unit: 'hours', digits: 2 },
]

function reportedDays(row: UserSummaryRow, key: SummarySortKey): number {
  return key.includes('Steps') ? row.stepsDays : key.includes('Calories') ? row.caloriesDays : row.sleepDays
}

function UserSummaryTable({ rows, workspace, period, from, to }: { rows: UserSummaryRow[]; workspace: number | 'all'; period: ReportPeriod; from: string; to: string }): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [copyStatus, setCopyStatus] = useState('')
  const filteredRows = useMemo(() => rows.filter((row) => row.walletAddress.toLowerCase().includes(search.trim().toLowerCase())), [rows, search])
  const walletHref = (wallet: string): string => { const params = new URLSearchParams({ workspace: String(workspace), wallet, period }); if (period === 'custom') { params.set('from', from); params.set('to', to) }; return `/dashboard/wallet-activity?${params}` }
  const [sortKey, setSortKey] = useState<SummarySortKey>('walletAddress')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const sortedRows = useMemo(() => [...filteredRows].sort((left, right) => {
    if (sortKey === 'walletAddress') {
      const leftMapped = /^0x[0-9a-f]{40}/i.test(left.walletAddress)
      const rightMapped = /^0x[0-9a-f]{40}/i.test(right.walletAddress)
      if (leftMapped !== rightMapped) return leftMapped ? -1 : 1
    }
    if (sortKey !== 'walletAddress' && (reportedDays(left, sortKey) === 0) !== (reportedDays(right, sortKey) === 0)) return reportedDays(left, sortKey) === 0 ? 1 : -1
    const comparison = sortKey === 'walletAddress'
      ? left.walletAddress.localeCompare(right.walletAddress, undefined, { numeric: true, sensitivity: 'base' })
      : compareDecimalStrings(left[sortKey], right[sortKey])
    return sortDirection === 'asc' ? comparison : -comparison
  }), [filteredRows, sortDirection, sortKey])
  const changeSort = (key: SummarySortKey): void => {
    if (key === sortKey) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection(key === 'walletAddress' ? 'asc' : 'desc') }
  }
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / 25))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sortedRows.slice((currentPage - 1) * 25, currentPage * 25)
  return <Card className="mt-4" title="Wallet Summary" subtitle={`ผู้มีข้อมูล ${rows.length.toLocaleString()} คน · หนึ่งแถวต่อคน แม้เชื่อมหลายกระเป๋าก็ไม่นับกิจกรรมซ้ำ`} noPad>
    <div className="border-b border-default px-4 py-3"><label className="text-xs text-muted">Search Wallet Address<input type="search" className="input mt-1 max-w-xl font-mono" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="0x…" /></label><span className="sr-only" aria-live="polite">{copyStatus}</span></div>
    {sortedRows.length === 0 ? <div className="py-16 text-center text-sm text-muted">ไม่พบข้อมูลผู้ใช้งานในช่วงเวลานี้</div> : <div className="max-h-[620px] overflow-auto thin-scroll" tabIndex={0} role="region" aria-label="Scrollable Wallet Summary">
      <table className="min-w-[1120px] w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[rgb(var(--surface))]"><tr className="border-b border-default text-[10.5px] uppercase tracking-wider text-faint">
          {summaryColumns.map((column) => <th key={column.key} className={`px-4 py-3 font-medium ${column.key === 'walletAddress' ? 'text-left' : 'text-right'}`} aria-sort={sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className={`inline-flex w-full min-h-8 items-center gap-1 hover:text-default ${column.key === 'walletAddress' ? 'justify-start' : 'justify-end'}`} onClick={() => changeSort(column.key)}>{column.label}<span aria-hidden="true">{sortKey === column.key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span></button>
          </th>)}<th className="px-4 py-3 text-left text-xs font-medium text-faint">Reported days<br />Steps / Calories / Sleep</th>
        </tr></thead>
        <tbody>{pageRows.map((row) => <tr key={row.userId} className="tbl-row border-b border-default last:border-0">
          {summaryColumns.map((column) => <td key={column.key} className={`whitespace-nowrap px-4 py-3 ${column.key === 'walletAddress' ? 'max-w-[300px] whitespace-normal break-all font-mono text-left text-xs text-default' : 'text-right font-mono text-xs text-muted'}`}>{column.key === 'walletAddress' ? row.wallets.length ? <div className="space-y-2">{row.wallets.map((wallet) => <div key={wallet} className="flex flex-wrap items-center gap-2"><a href={walletHref(wallet)} className="font-mono text-accent underline" title={wallet}>{wallet.slice(0, 8)}…{wallet.slice(-6)}</a><button type="button" className="rounded border border-default px-2 py-1 text-[10px] hover:text-accent" aria-label={`Copy wallet ${wallet}`} onClick={() => void navigator.clipboard.writeText(wallet).then(() => setCopyStatus('Wallet address copied')).catch(() => setCopyStatus('Unable to copy wallet address'))}>Copy</button><a href={`https://www.kubscan.com/address/${encodeURIComponent(wallet)}?tab=tokens`} target="_blank" rel="noopener noreferrer" className="text-[10px] underline" aria-label={`Open ${wallet} on KubScan`}>KubScan ↗</a></div>)}</div> : row.walletAddress : reportedDays(row, column.key) === 0 ? <span title="ยังไม่มีรายงานสำหรับข้อมูลประเภทนี้" aria-label="ยังไม่มีรายงาน">—</span> : `${format(row[column.key], column.digits)} ${column.unit}`}</td>)}<td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">{row.stepsDays} / {row.caloriesDays} / {row.sleepDays}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-3 text-xs text-muted" aria-label="Wallet Summary pages"><span>{sortedRows.length.toLocaleString()} participants · Page {currentPage} of {totalPages}</span><div className="flex gap-2"><button type="button" className="btn btn-ghost min-h-11" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="btn btn-ghost min-h-11" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button></div></nav>
  </Card>
}

function Empty({ label }: { label: string }): React.JSX.Element {
  return <div className="flex h-[290px] items-center justify-center text-sm text-muted">{label}</div>
}
