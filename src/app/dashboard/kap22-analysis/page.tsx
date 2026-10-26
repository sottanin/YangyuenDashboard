'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Icon } from '@/components/ui/Icon'
import { KpiTile } from '@/components/ui/KpiTile'
import { ReportScope } from '@/components/reports/ReportScope'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonKpi, SkeletonTable } from '@/components/ui/SkeletonCard'
import { SingleLineChart, type SingleLinePoint } from '@/components/charts/SingleLineChart'
import { HorizontalBarChart, type HorizontalBarPoint } from '@/components/charts/HorizontalBarChart'
import { PointTokenLockDonuts, type PointTokenLock } from '@/components/charts/PointTokenLockDonuts'
import { Heatmap } from '@/components/charts/Heatmap'
import { useWorkspace } from '@/lib/WorkspaceContext'
import { TokenAvatar } from '@/components/ui/TokenAvatar'
import { useChartPermissions } from '@/lib/ChartPermissionContext'
import { AddressLink } from '@/components/ui/AddressLink'

interface TokenOption { id: string; name: string; symbol: string; address: string; imageUrl: string | null }
interface ChartAnnotation { id: string; date: string; event: string; createdAt: string; updatedAt: string }
type Period = 'all' | 'week' | 'month' | '3months' | 'year' | 'custom'
interface SummaryResponse {
  comparison?: {from:string;to:string} | null
  activityComparison?: Record<string, {change:number|null;changeLabel:string} | null>
  period?: { from: string; to: string }
  dataThrough?: string | null
  snapshotAt?: string | null
  activity?: { mint: string; burn?: string; redemptionBurn?: string; redemptionFee?: string; distributed?: string; totalTransactions?: number }
  token: TokenOption
  distributorPool: string
  operationPool: string
  mint: string
  transferToUsers: string
  burn: string
  expired: string
  reconciliationDelta: string
  reconciliationMatched: boolean
  daily: Array<{ date: string; totalTransactions: number; totalAmount: string }>
  timezone: string
  historyStart: string
  totalTransactions?: number
  backupWallet?: string
  workspaceWallet?: string
  userWallet?: string
  redemptionBurn?: string
  redemptionFee?: string
  pointTokenLocks?: PointTokenLock[]
}
type TransactionType = 'Mint' | 'Burn' | 'Transfer'
interface TransactionRow {
  id: string; key: string; txId: string; timestamp: string; type: TransactionType; flow: string
  status: string | null; tokenName: string; tokenSymbol: string; fromHash: string; fromName: string | null
  toHash: string; toName: string | null; value: string
}
interface TransactionsResponse { rows: TransactionRow[]; total: number; totalPages: number; page: number; limit: number }
interface TopUsersResponse { token: TokenOption; topReceived: HorizontalBarPoint[]; topBalances: HorizontalBarPoint[] }

const PAGE_SIZE = 20

function compactAddress(value: string): string { return `${value.slice(0, 7)}…${value.slice(-5)}` }
function cleanTokenName(name: string, symbol: string): string {
  const trimmed = name.trim()
  const suffix = ` (${symbol})`
  return trimmed.toLowerCase().endsWith(suffix.toLowerCase()) ? trimmed.slice(0, -suffix.length).trim() : trimmed
}
function formatAmount(value: string): string {
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return value
  const [, sign, integer, fraction = ''] = match
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const visibleFraction = fraction.slice(0, 4).replace(/0+$/, '')
  return `${sign}${groupedInteger}${visibleFraction ? `.${visibleFraction}` : ''}`
}
function formatTimestamp(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('th-TH', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
async function responseJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json()
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Unable to load report'
    throw new Error(message)
  }
  return body as T
}

export default function Kap22AnalysisPage() {
  const pathname = usePathname()
  const reportType = pathname === '/dashboard/tokens' || pathname === '/dashboard/kap20-analysis' ? 'kap20' : 'kap22'
  const isKap20 = reportType === 'kap20'
  const reportLabel = isKap20 ? 'KAP-20' : 'KAP-22'
  const reportTitle = isKap20 ? 'Tokens (KAP-20)' : 'Point Tokens (KAP-22)'
  const apiBase = `/api/reports/${reportType}`
  const { canViewChart } = useChartPermissions()
  const chartKey = (suffix: string): string => `${reportType}.${suffix}`
  const canViewMint = canViewChart(chartKey('mint'))
  const canViewBackupWallet = isKap20 && canViewChart('kap20.backup-wallet')
  const canViewWorkspaceWallet = isKap20 && canViewChart('kap20.workspace-wallet')
  const canViewDistributorPool = canViewChart(chartKey('distributor-pool'))
  const canViewOperationPool = !isKap20 && canViewChart('kap22.operation-pool')
  const canViewUserWallet = canViewChart(chartKey('user-wallet'))
  const canViewBurn = canViewChart(isKap20 ? 'kap20.redemption-burn' : 'kap22.burn-wallet')
  const canViewRedemptionFee = isKap20 && canViewChart('kap20.redemption-fee')
  const canViewExpired = !isKap20 && canViewChart('kap22.expired')
  const canViewDailyCount = canViewChart(chartKey('daily-transaction-count'))
  const canViewTotalTransactions = !isKap20 && canViewDailyCount
  const canViewKpis = canViewTotalTransactions || canViewMint || canViewBackupWallet || canViewWorkspaceWallet || canViewDistributorPool || canViewOperationPool || canViewUserWallet || canViewBurn || canViewRedemptionFee || canViewExpired
  const canViewHoldings = canViewBackupWallet || canViewWorkspaceWallet || canViewDistributorPool || canViewOperationPool || canViewUserWallet || canViewExpired
  const canViewFlows = canViewTotalTransactions || canViewMint || canViewBurn || canViewRedemptionFee || (!isKap20 && canViewUserWallet)
  const canViewDailyVolume = canViewChart(chartKey('daily-transfer-volume'))
  const canViewHeatmap = canViewChart(chartKey('activity-heatmap'))
  const canViewConversion = isKap20 && canViewChart('kap20.conversion-balance')
  const canViewTopRecipients = canViewChart(chartKey('top-recipients'))
  const canViewTopHolders = canViewChart(chartKey('top-holders'))
  const canViewHistory = canViewChart(chartKey('transaction-history'))
  const canViewDailyCharts = canViewDailyCount || canViewDailyVolume
  const canViewSummary = canViewKpis || canViewDailyCharts || canViewHeatmap || canViewConversion
  const canViewTopUsers = canViewTopRecipients || canViewTopHolders
  const hasVisibleContent = canViewSummary || canViewHeatmap || canViewTopUsers || canViewHistory
  const { selected, loading: workspaceLoading } = useWorkspace()
  const [tokens, setTokens] = useState<TokenOption[]>([])
  const [selectedToken, setSelectedToken] = useState('')
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [transactions, setTransactions] = useState<TransactionsResponse | null>(null)
  const [topUsers, setTopUsers] = useState<TopUsersResponse | null>(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [tokensLoading, setTokensLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(false)
  const [topUsersLoading, setTopUsersLoading] = useState(false)
  const [tokensError, setTokensError] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [tableError, setTableError] = useState('')
  const [topUsersError, setTopUsersError] = useState('')
  const [heatmap, setHeatmap] = useState<number[][]>([])
  const [heatmapLoading, setHeatmapLoading] = useState(false)
  const [heatmapError, setHeatmapError] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([])
  const [annotationModal, setAnnotationModal] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<ChartAnnotation | null>(null)
  const [annotationDate, setAnnotationDate] = useState('')
  const [annotationEvent, setAnnotationEvent] = useState('')
  const [annotationError, setAnnotationError] = useState('')
  const [annotationSaving, setAnnotationSaving] = useState(false)
  const tokenRequest = useRef(0)
  const summaryRequest = useRef(0)
  const tableRequest = useRef(0)
  const topUsersRequest = useRef(0)
  const heatmapRequest = useRef(0)
  const annotationRequest = useRef(0)
  const workspace = String(selected.id)
  const annotationSelection = useRef({ token: '', workspace: '' })
  const annotationSelectionGeneration = useRef(0)

  const loadTokens = useCallback(async (signal?: AbortSignal): Promise<void> => {
    const requestId = ++tokenRequest.current
    setTokensLoading(true)
    setTokensError('')
    try {
      const response = await fetch(`${apiBase}/tokens?workspace=${encodeURIComponent(workspace)}`, { signal })
      const data = await responseJson<{ tokens: TokenOption[] }>(response)
      if (requestId !== tokenRequest.current) return
      setTokens(data.tokens)
      const preferred = data.tokens.find((token) => token.symbol.toUpperCase() === (isKap20 ? 'ICCYYN' : 'FIT'))
      setSelectedToken((current) => data.tokens.some((token) => token.address.toLowerCase() === current.toLowerCase()) ? current : (preferred ?? data.tokens[0])?.address ?? '')
      setPage(1)
    } catch (error) {
      if (signal?.aborted || requestId !== tokenRequest.current) return
      setTokens([])
      setSelectedToken('')
      setTokensError(error instanceof Error ? error.message : 'Unable to load token options')
    } finally {
      if (requestId === tokenRequest.current) setTokensLoading(false)
    }
  }, [apiBase, isKap20, workspace, setPage, setSelectedToken])

  const loadSummary = useCallback(async (token: string, signal?: AbortSignal): Promise<void> => {
    const requestId = ++summaryRequest.current
    setSummaryLoading(true)
    setSummaryError('')
    setSummary(null)
    try {
      const query = new URLSearchParams({ token, workspace, period }); if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) }
      const response = await fetch(`${apiBase}/summary?${query}`, { signal })
      const data = await responseJson<SummaryResponse>(response)
      if (requestId === summaryRequest.current) setSummary(data)
    } catch (error) {
      if (signal?.aborted || requestId !== summaryRequest.current) return
      setSummaryError(error instanceof Error ? error.message : 'Unable to load summary')
    } finally {
      if (requestId === summaryRequest.current) setSummaryLoading(false)
    }
  }, [apiBase, workspace, period, customFrom, customTo])

  const loadTransactions = useCallback(async (token: string, requestedPage: number, requestedSearch: string, signal?: AbortSignal): Promise<void> => {
    const requestId = ++tableRequest.current
    setTableLoading(true)
    setTableError('')
    try {
      const query = new URLSearchParams({ token, workspace, period, page: String(requestedPage), limit: String(PAGE_SIZE) }); if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) }
      if (requestedSearch) query.set('search', requestedSearch)
      const response = await fetch(`${apiBase}/transactions?${query}`, { signal })
      const data = await responseJson<TransactionsResponse>(response)
      if (requestId === tableRequest.current) setTransactions(data)
    } catch (error) {
      if (signal?.aborted || requestId !== tableRequest.current) return
      setTransactions(null)
      setTableError(error instanceof Error ? error.message : 'Unable to load transactions')
    } finally {
      if (requestId === tableRequest.current) setTableLoading(false)
    }
  }, [apiBase, workspace, period, customFrom, customTo])

  const loadTopUsers = useCallback(async (token: string, signal?: AbortSignal): Promise<void> => {
    const requestId = ++topUsersRequest.current
    setTopUsersLoading(true)
    setTopUsersError('')
    setTopUsers(null)
    try {
      const query = new URLSearchParams({ token, workspace, period }); if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) }
      const response = await fetch(`${apiBase}/top-users?${query}`, { signal })
      const data = await responseJson<TopUsersResponse>(response)
      if (requestId === topUsersRequest.current) setTopUsers(data)
    } catch (error) {
      if (signal?.aborted || requestId !== topUsersRequest.current) return
      setTopUsersError(error instanceof Error ? error.message : 'Unable to load user rankings')
    } finally {
      if (requestId === topUsersRequest.current) setTopUsersLoading(false)
    }
  }, [apiBase, workspace, period, customFrom, customTo])

  const loadHeatmap = useCallback(async (token: string, from: string | null, to: string | null, signal?: AbortSignal): Promise<void> => {
    const requestId = ++heatmapRequest.current
    setHeatmapLoading(true)
    setHeatmapError('')
    try {
      const query = new URLSearchParams({ token, workspace })
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      const response = await fetch(`/api/charts/heatmap?${query}`, { signal })
      const data = await responseJson<{ heatmap: number[][] }>(response)
      if (requestId === heatmapRequest.current) setHeatmap(data.heatmap)
    } catch (error) {
      if (!signal?.aborted && requestId === heatmapRequest.current) {
        setHeatmap([])
        setHeatmapError(error instanceof Error ? error.message : 'Unable to load activity heatmap')
      }
    } finally {
      if (requestId === heatmapRequest.current) setHeatmapLoading(false)
    }
  }, [workspace])

  useEffect(() => {
    if (workspaceLoading || !hasVisibleContent) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadTokens(controller.signal) })
    return () => controller.abort()
  }, [hasVisibleContent, loadTokens, workspaceLoading])

  useEffect(() => {
    if (!selectedToken) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      if (canViewSummary) void loadSummary(selectedToken, controller.signal)
      if (canViewTopUsers) void loadTopUsers(selectedToken, controller.signal)
    })
    return () => controller.abort()
  }, [canViewSummary, canViewTopUsers, selectedToken, loadSummary, loadTopUsers])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim()
      setSearch(trimmed.length >= 2 ? trimmed : '')
      setPage(1)
    }, 375)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!selectedToken || !canViewHistory) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadTransactions(selectedToken, page, search, controller.signal) })
    return () => controller.abort()
  }, [canViewHistory, page, search, selectedToken, loadTransactions])

  const loadAnnotations = useCallback(async (token: string, signal?: AbortSignal): Promise<void> => {
    const requestId = ++annotationRequest.current
    try {
      const response = await fetch(`${apiBase}/annotations?token=${encodeURIComponent(token)}&workspace=${encodeURIComponent(workspace)}`, { signal })
      const data = await responseJson<{ annotations: ChartAnnotation[] }>(response)
      if (requestId === annotationRequest.current) setAnnotations(data.annotations)
    } catch (error) {
      if (!signal?.aborted && requestId === annotationRequest.current) {
        setAnnotationError(error instanceof Error ? error.message : 'Unable to load annotations')
      }
    }
  }, [apiBase, workspace, setAnnotationError, setAnnotations])

  useEffect(() => {
    annotationSelection.current = { token: selectedToken, workspace }
    annotationSelectionGeneration.current += 1
    annotationRequest.current += 1
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setAnnotations([])
      setAnnotationError('')
      setAnnotationSaving(false)
      if (selectedToken && canViewDailyCharts) void loadAnnotations(selectedToken, controller.signal)
    })
    return () => controller.abort()
  }, [canViewDailyCharts, selectedToken, loadAnnotations, workspace])

  const customRangeInvalid = period === 'custom' && (!customFrom || !customTo || customFrom > customTo)
  const filteredDaily = customRangeInvalid ? [] : summary?.daily ?? []
  const heatmapFrom = customRangeInvalid ? null : summary?.period?.from ?? null
  const heatmapTo = customRangeInvalid ? null : summary?.period?.to ?? null
  useEffect(() => {
    if (!canViewHeatmap || !selectedToken || !summary || customRangeInvalid) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadHeatmap(selectedToken, heatmapFrom, heatmapTo, controller.signal)
    })
    return () => controller.abort()
  }, [canViewHeatmap, customRangeInvalid, heatmapFrom, heatmapTo, loadHeatmap, selectedToken, summary])
  const annotationMap = new Map<string, string[]>()
  for (const annotation of annotations) annotationMap.set(annotation.date, [...(annotationMap.get(annotation.date) ?? []), annotation.event])

  const transactionChartData: SingleLinePoint[] = filteredDaily.map((point) => ({
    label: point.date,
    value: point.totalTransactions,
    annotations: annotationMap.get(point.date),
  }))
  const amountChartData: SingleLinePoint[] = filteredDaily.map((point) => ({
    label: point.date,
    value: Number(point.totalAmount),
    annotations: annotationMap.get(point.date),
  }))
  const selectedOption = tokens.find((token) => token.address.toLowerCase() === selectedToken.toLowerCase())

  function openAnnotation(annotation: ChartAnnotation | null = null): void {
    setEditingAnnotation(annotation); setAnnotationDate(annotation?.date ?? summary?.daily.at(-1)?.date ?? ''); setAnnotationEvent(annotation?.event ?? ''); setAnnotationError(''); setAnnotationModal(true)
  }
  async function saveAnnotation(): Promise<void> {
    if (!selectedToken) return
    const tokenAtStart = selectedToken
    const workspaceAtStart = workspace
    const generationAtStart = annotationSelectionGeneration.current
    const selectionIsCurrent = (): boolean => (
      generationAtStart === annotationSelectionGeneration.current
      && annotationSelection.current.token === tokenAtStart
      && annotationSelection.current.workspace === workspaceAtStart
    )
    setAnnotationSaving(true); setAnnotationError('')
    try {
      const response = await fetch(editingAnnotation ? `${apiBase}/annotations/${editingAnnotation.id}` : `${apiBase}/annotations`, { method: editingAnnotation ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenAtStart, workspace: workspaceAtStart, date: annotationDate, event: annotationEvent }) })
      const result = await response.json() as { error?: string }
      if (!selectionIsCurrent()) return
      if (!response.ok) throw new Error(result.error ?? 'Unable to save annotation')
      await loadAnnotations(tokenAtStart)
      if (selectionIsCurrent()) setAnnotationModal(false)
    } catch (error) {
      if (selectionIsCurrent()) setAnnotationError(error instanceof Error ? error.message : 'Unable to save annotation')
    } finally {
      if (selectionIsCurrent()) setAnnotationSaving(false)
    }
  }
  async function deleteAnnotation(annotation: ChartAnnotation): Promise<void> {
    if (!window.confirm('Delete this annotation?')) return
    const tokenAtStart = selectedToken
    const workspaceAtStart = workspace
    const generationAtStart = annotationSelectionGeneration.current
    const selectionIsCurrent = (): boolean => (
      generationAtStart === annotationSelectionGeneration.current
      && annotationSelection.current.token === tokenAtStart
      && annotationSelection.current.workspace === workspaceAtStart
    )
    setAnnotationSaving(true); setAnnotationError('')
    try {
      const query = new URLSearchParams({ token: tokenAtStart, workspace: workspaceAtStart })
      const response = await fetch(`${apiBase}/annotations/${annotation.id}?${query}`, { method: 'DELETE' })
      if (!selectionIsCurrent()) return
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? 'Unable to delete annotation') }
      await loadAnnotations(tokenAtStart)
      if (selectionIsCurrent()) { setEditingAnnotation(null); setAnnotationDate(''); setAnnotationEvent('') }
    } catch (error) {
      if (selectionIsCurrent()) setAnnotationError(error instanceof Error ? error.message : 'Unable to delete annotation')
    } finally {
      if (selectionIsCurrent()) setAnnotationSaving(false)
    }
  }

  return <div className="min-w-0 max-w-full">
    <PageHeader
      title={reportTitle}
      subtitle="แยกยอดคงเหลือ/สถานะจากประวัติทั้งหมด ออกจากกิจกรรมในช่วงเวลาที่เลือก"
      actions={hasVisibleContent ? <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
        <TokenSelector label={isKap20 ? 'Token (KAP-20)' : 'Point Token (KAP-22)'} tokens={tokens} value={selectedToken} disabled={tokensLoading || tokens.length === 0} onChange={(value) => { setPage(1); setSearchInput(''); setSearch(''); setSelectedToken(value) }} />
        {hasVisibleContent && <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted sm:w-36" htmlFor="kap22-period">Period
          <select id="kap22-period" className="input min-h-11" value={period} onChange={(event) => { setPeriod(event.target.value as Period); setPage(1) }}>
            <option value="all">All-time</option><option value="week">1 Week</option><option value="month">1 Month</option><option value="3months">3 Months</option><option value="year">1 Year</option><option value="custom">Select dates</option>
          </select>
        </label>}
        {hasVisibleContent && period === 'custom' && <div className="flex min-w-0 items-end gap-2 sm:w-auto"><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted" htmlFor="kap22-from">From<input id="kap22-from" type="date" className="input min-h-11 min-w-0" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted" htmlFor="kap22-to">To<input id="kap22-to" type="date" className="input min-h-11 min-w-0" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label></div>}
        {canViewDailyCharts && <button type="button" className="btn btn-primary min-h-11 self-end px-4" onClick={() => openAnnotation()}>+ Add event</button>}
      </div> : undefined}
    />

    {!hasVisibleContent ? <section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-default px-6 py-12 text-center"><h2 className="text-base font-semibold text-default">ยังไม่มีรายงานให้แสดง</h2><p className="mt-2 max-w-md text-sm text-muted">คุณเปิดเมนูนี้ได้ แต่ยังไม่ได้รับสิทธิ์ดูกราฟหรือข้อมูล กรุณาติดต่อผู้ดูแลหากต้องการใช้งาน</p></section> : tokensError ? <ErrorCard message={tokensError} onRetry={() => void loadTokens()} /> : tokens.length === 0 && !tokensLoading ? (
      <Card><div className="py-12 text-center"><div className="text-sm font-medium text-default">No active {reportLabel} tokens</div><p className="mt-1 text-xs text-muted">Add an active token contract in the registry.</p></div></Card>
    ) : <>
      {customRangeInvalid ? <div role="alert" className="mb-4"><ErrorCard message="Select valid From and To dates before viewing period activity." /></div> : null}
      {summary ? <ReportScope from={summary.period?.from} to={summary.period?.to} timezone={summary.timezone} dataThrough={summary.dataThrough} snapshotAt={summary.snapshotAt} comparisonNote={summary.comparison ? `เทียบกับช่วง ${summary.comparison.from} ถึง ${summary.comparison.to} ข้อมูลช่วงปัจจุบันอาจยังไม่ครบ` : 'แสดงข้อมูลทั้งหมด หรือยังไม่มีข้อมูลช่วงก่อนหน้าที่นำมาเทียบได้'} scopeNote="ช่วงวันที่มีผลกับยอดรับ–ส่ง อันดับผู้รับ และประวัติรายการ ส่วนยอดคงเหลือใช้ข้อมูลล่าสุดหรือยอดคำนวณจากประวัติทั้งหมด วันที่แสดงศูนย์หมายถึงยังไม่พบรายการในข้อมูลที่มี ไม่ได้ยืนยันว่าไม่มีการใช้งานเกิดขึ้น" /> : null}
      {canViewKpis && <div>{summaryError ? <div className="mb-4"><ErrorCard message={summaryError} onRetry={() => selectedToken && void loadSummary(selectedToken)} /></div> : summaryLoading || !summary ? <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 4 }, (_, key) => <SkeletonKpi key={key} />)}</div> : <>
      {canViewHoldings ? <><h2 className="mb-2 text-sm font-semibold text-default">ยอดคงเหลือล่าสุด · ไม่เปลี่ยนตามช่วงวันที่เลือก</h2>
      <p className="mb-3 text-xs text-muted">ยอดในกองกลางคำนวณจากประวัติรับ–ส่งทั้งหมด ส่วนยอดของผู้ใช้และยอดสำรองใช้ข้อมูลล่าสุดเมื่อมี ยอดเหล่านี้ไม่ใช่ยอด ณ วันที่ย้อนหลังที่เลือก และคะแนนหมดอายุเป็นยอดล่าสุด</p>
      <section aria-label="Holdings and recorded positions" className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canViewBackupWallet && <KpiTile label="Main Wallet · recorded position" subLabel="ยอดรับสุทธิในกระเป๋าหลัก คำนวณจากประวัติทั้งหมดที่มี" value={`${formatAmount(summary.backupWallet ?? '0')} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="target" sparkColor="var(--accent-3)" />}
        {canViewWorkspaceWallet && <KpiTile label="Workspace Wallet · latest position" subLabel="ยอดล่าสุดในกระเป๋า Workspace ไม่เปลี่ยนตามช่วงวันที่เลือก" value={`${formatAmount(summary.workspaceWallet ?? '0')} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="lock" sparkColor="var(--accent-2)" />}
        {canViewDistributorPool && <KpiTile label={isKap20 ? 'Point-contract reserves · latest position' : 'DistributorPool · recorded position'} subLabel={isKap20 ? 'ยอดสำรองล่าสุดที่อยู่ในสัญญา Point Token ไม่เปลี่ยนตามช่วงวันที่เลือก' : 'คะแนนคงเหลือในกองกลางแจกคะแนน คำนวณจากประวัติรับ–ส่งทั้งหมด'} value={`${formatAmount(summary.distributorPool)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="box" />}
        {canViewOperationPool && <KpiTile label="OperationPool · recorded position" subLabel="คะแนนคงเหลือในกองกลางดำเนินงาน คำนวณจากประวัติรับ–ส่งทั้งหมด" value={`${formatAmount(summary.operationPool)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="target" sparkColor="var(--accent-3)" />}
        {canViewUserWallet && <KpiTile label={isKap20 ? 'User Wallet · latest position' : 'User position · distributed less burned'} subLabel={isKap20 ? 'ยอดรวมล่าสุดในกระเป๋าผู้ใช้ ไม่เปลี่ยนตามช่วงวันที่เลือก' : 'คะแนนที่แจกให้ผู้ใช้ทั้งหมด หักคะแนนที่นำกลับมาแลกและถูกเผาแล้ว'} value={`${formatAmount(isKap20 ? summary.userWallet ?? '0' : summary.transferToUsers)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="users" sparkColor="var(--accent-2)" />}
        {canViewExpired && <KpiTile label="Expired · latest snapshot" subLabel="คะแนนหมดอายุจากข้อมูลล่าสุด ไม่เปลี่ยนตามช่วงวันที่เลือก" value={`${formatAmount(summary.expired)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="alert" sparkColor="var(--danger)" />}
      </section>
      </> : null}
      {canViewFlows ? <><h2 className="mb-3 text-sm font-semibold text-default">กิจกรรมในช่วงวันที่เลือก</h2>
      <section aria-label="Period activity" className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canViewTotalTransactions && <KpiTile label="Total Transactions" subLabel="จำนวนธุรกรรมของโทเคนนี้ในช่วงวันที่เลือก นับธุรกรรมเดียวเพียงครั้งเดียว" {...(summary.activityComparison?.totalTransactions ?? {})} value={(summary.activity?.totalTransactions ?? 0).toLocaleString('en-US')} icon="pulse" />}
        {canViewMint && <KpiTile label="Issued (Mint) · period" subLabel="จำนวนโทเคนที่ออกใหม่ในช่วงวันที่เลือก" {...(summary.activityComparison?.mint ?? {})} value={`${formatAmount(summary.activity?.mint ?? '0')} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="arrowUp" sparkColor="var(--success)" />}
        {canViewBurn && <KpiTile label={isKap20 ? 'Marketplace redemption paid (net)' : 'Swapped / burned · period'} subLabel={isKap20 ? 'โทเคนที่ใช้แลกสิทธิ์ในช่วงวันที่เลือก ไม่รวมค่าธรรมเนียม' : 'คะแนนที่นำกลับมาแลกและถูกเผาในช่วงวันที่เลือก'} {...(summary.activityComparison?.[isKap20 ? 'redemptionBurn' : 'burn'] ?? {})} value={`${formatAmount(isKap20 ? summary.activity?.redemptionBurn ?? '0' : summary.activity?.burn ?? '0')} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="refresh" sparkColor="var(--danger)" />}
        {canViewRedemptionFee && <KpiTile label="Redemption Fee" subLabel="ค่าธรรมเนียมการแลกสิทธิ์ในช่วงวันที่เลือก" {...(summary.activityComparison?.redemptionFee ?? {})} value={`${formatAmount(summary.activity?.redemptionFee ?? '0')} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="target" sparkColor="var(--warn)" />}
        {!isKap20 && canViewUserWallet ? <KpiTile label="Points distributed · period" subLabel="จำนวนคะแนนที่กองกลางแจกให้ผู้ใช้ในช่วงวันที่เลือก" {...(summary.activityComparison?.distributed ?? {})} value={`${formatAmount(summary.activity?.distributed ?? '0')} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="users" /> : null}
      </section></> : null}
      </>}</div>}
      {!canViewKpis && summaryError ? <ErrorCard message={summaryError} onRetry={() => selectedToken && void loadSummary(selectedToken)} /> : null}

      {canViewKpis && summary && !summary.reconciliationMatched ? <div className="mb-4" role="status">
        <ErrorCard message={`ยอดรับ–ส่งของ ${reportLabel} ยังไม่ตรงกัน ผลต่าง: ${formatAmount(summary.reconciliationDelta)} ${summary.token.symbol}`} />
      </div> : null}

      <div className="mb-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {canViewDailyCount && <div><Card className="min-w-0 max-w-full" title={isKap20 ? 'User-destination transfer transactions' : 'Distribution transactions'} subtitle={isKap20 ? 'จำนวนธุรกรรมที่โอนโทเคนให้ผู้ใช้ในแต่ละวัน โดยไม่นับการโอนไปยังกระเป๋าของระบบ' : 'จำนวนธุรกรรมที่แจกคะแนนจากกองกลางให้ผู้ใช้ในแต่ละวัน'}>
          {customRangeInvalid ? <div className="flex h-[300px] items-center justify-center text-sm text-red-400">Select a valid From and To date.</div> : summaryLoading ? <div className="h-[300px] shimmer rounded-xl" /> : transactionChartData.length === 0 ? <div className="flex h-[300px] items-center justify-center text-sm text-muted">ยังไม่พบประวัติการโอนในช่วงนี้</div> : <SingleLineChart data={transactionChartData} label="Total transactions" tooltipUnit="transactions" averageUnit="transactions" valueKind="count" fractionDigits={2} averageLabelPrefix="" color="var(--success)" />}
        </Card></div>}
        {canViewDailyVolume && <div><Card className="min-w-0 max-w-full" title={isKap20 ? 'Tokens transferred to user destinations' : 'Points distributed'} subtitle="จำนวนโทเคนที่ผู้ใช้ได้รับในแต่ละวัน จากรายการกลุ่มเดียวกับกราฟจำนวนธุรกรรมและตามช่วงวันที่เลือก">
          {customRangeInvalid ? <div className="flex h-[300px] items-center justify-center text-sm text-red-400">Select a valid From and To date.</div> : summaryLoading ? <div className="h-[300px] shimmer rounded-xl" /> : amountChartData.length === 0 ? <div className="flex h-[300px] items-center justify-center text-sm text-muted">ยังไม่พบประวัติการโอนในช่วงนี้</div> : <SingleLineChart data={amountChartData} label={`Total amount (${summary?.token.symbol ?? 'KAP-22'})`} tooltipUnit={`amounts (${summary?.token.symbol ?? 'KAP-22'})`} averageUnit={summary?.token.symbol ?? 'KAP-22'} valueKind="amount" fractionDigits={2} averageLabelPrefix="" color="var(--danger)" />}
        </Card></div>}
      </div>

      {canViewHeatmap && <div><Card className="mb-4 min-w-0 max-w-full" title="Activity Heatmap" subtitle="ดูวันและเวลาที่มีการใช้งานโทเคนนี้มาก โดยสีเข้มหมายถึงมีรายการมาก แสดงตามเวลาไทยและรวมรายการทุกประเภท จึงอาจต่างจากกราฟที่นับเฉพาะการแจกให้ผู้ใช้">
        {heatmapLoading ? <div className="h-[220px] shimmer rounded-xl" /> : heatmapError ? <ErrorCard message={heatmapError} /> : heatmap.length === 0 || !heatmap.some((row) => row.some((value) => value > 0)) ? <div className="flex h-[220px] items-center justify-center text-sm text-muted">No transaction activity found</div> : <Heatmap data={heatmap} rowLabels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} colLabels={Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)} />}
      </Card></div>}

      {isKap20 && summary && canViewConversion ? <Card className="mb-4 min-w-0 max-w-full" title="KAP-20 reserves held by Point Token contracts" subtitle="ดูสัดส่วนโทเคนที่ส่งออกเทียบกับที่รับเข้า พร้อมยอดสำรองล่าสุดและยอดรับ–ส่งสะสมของแต่ละ Point Token">
        <PointTokenLockDonuts data={summary.pointTokenLocks ?? []} balanceSymbol={summary.token.symbol} />
      </Card> : null}

      <div className="mb-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {canViewTopRecipients && <Card className="min-w-0 max-w-full" title="Top 10 Token Recipients" subtitle="แสดงผู้ใช้ 10 อันดับที่ได้รับโทเคนมากที่สุดในช่วงวันที่เลือก">
          {topUsersError ? <ErrorCard message={topUsersError} onRetry={() => selectedToken && void loadTopUsers(selectedToken)} /> : topUsersLoading || !topUsers ? <div className="h-[336px] shimmer rounded-xl" /> : topUsers.topReceived.length === 0 ? <div className="flex h-[336px] items-center justify-center text-center text-sm text-muted">ยังไม่พบรายการที่ผู้ใช้ได้รับโทเคน</div> : <HorizontalBarChart drilldownPeriod={period} drilldownFrom={customFrom} drilldownTo={customTo} data={topUsers.topReceived} symbol={topUsers.token.symbol} color="var(--accent)" ariaLabel={`Top 10 users by total ${topUsers.token.symbol} received`} />}
        </Card>}
        {canViewTopHolders && <Card className="min-w-0 max-w-full" title="Top 10 Token Holders by Balance" subtitle="แสดงผู้ใช้ 10 อันดับที่มียอดโทเคนคงเหลือมากที่สุดจากข้อมูลล่าสุด โดยไม่เปลี่ยนตามช่วงวันที่เลือก">
          {topUsersError ? <ErrorCard message={topUsersError} onRetry={() => selectedToken && void loadTopUsers(selectedToken)} /> : topUsersLoading || !topUsers ? <div className="h-[336px] shimmer rounded-xl" /> : topUsers.topBalances.length === 0 ? <div className="flex h-[336px] items-center justify-center text-center text-sm text-muted">ยังไม่พบยอดคงเหลือที่มากกว่าศูนย์จากข้อมูลล่าสุด</div> : <HorizontalBarChart drilldownPeriod={period} drilldownFrom={customFrom} drilldownTo={customTo} data={topUsers.topBalances} symbol={topUsers.token.symbol} color="var(--success)" ariaLabel={`Top 10 users by latest synchronized on-chain ${topUsers.token.symbol} balance`} rankMarker="wealth" />}
        </Card>}
      </div>

      {canViewHistory && <Card className="min-w-0 max-w-full" title="Transaction Events" subtitle="ดูรายละเอียดรายการโอนในช่วงวันที่เลือก ธุรกรรมหนึ่งอาจมีหลายรายการ จึงอาจพบรหัสธุรกรรมเดียวกันหลายแถว" noPad>
        <div className="border-b border-default p-4 sm:p-5">
          <label htmlFor="kap22-transaction-search" className="sr-only">Search {reportLabel} transactions</label>
          <div className="relative max-w-xl">
            <input id="kap22-transaction-search" type="search" className="input w-full pl-3 pr-24" value={searchInput} maxLength={128} placeholder="Search TxId, From or To wallet address" onChange={(event) => setSearchInput(event.target.value)} />
            {searchInput ? <button type="button" className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-default" onClick={() => setSearchInput('')}>Clear</button> : null}
            <Icon name="search" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
          </div>
          {searchInput.trim().length === 1 ? <p className="mt-1.5 text-xs text-muted">กรอกอย่างน้อย 2 ตัวอักษรเพื่อค้นหา</p> : null}
        </div>
        {tableError ? <div className="p-5"><ErrorCard message={tableError} onRetry={() => selectedToken && void loadTransactions(selectedToken, page, search)} /></div> : tableLoading || !transactions ? <div className="p-5"><SkeletonTable rows={7} /></div> : transactions.rows.length === 0 ? (
          <div className="py-16 text-center"><div className="text-sm font-medium text-default">ไม่พบรายการในช่วงนี้</div><p className="mt-1 text-xs text-muted">{search ? `ไม่พบรายการที่ตรงกับ “${search}”` : 'ยังไม่พบรายการของโทเคนนี้ใน Workspace ที่เลือก'}</p>{search ? <button type="button" className="btn btn-ghost mt-4" onClick={() => setSearchInput('')}>Clear search</button> : null}</div>
        ) : <>
          <div className="w-full min-w-0 max-w-full overflow-x-auto thin-scroll [contain:inline-size]" tabIndex={0} role="region" aria-label={`Scrollable ${reportLabel} transaction table`}><table className="min-w-[920px] w-full text-sm">
            <caption><span className="sr-only">รายการรับ–ส่ง {selectedOption?.name ?? 'โทเคนที่เลือก'} ในช่วงวันที่เลือก</span></caption>
            <thead><tr className="border-b border-default text-[10.5px] uppercase tracking-wider text-faint">
              <th scope="col" className="px-5 py-3 text-left font-medium">Transaction</th><th scope="col" className="px-3 py-3 text-left font-medium">Type</th><th scope="col" className="px-3 py-3 text-left font-medium">From</th><th scope="col" className="px-3 py-3 text-left font-medium">To</th><th scope="col" className="px-3 py-3 text-right font-medium">Amount</th><th scope="col" className="px-3 py-3 text-left font-medium">Time</th><th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
            </tr></thead>
            <tbody>{transactions.rows.map((row) => <tr key={row.key || row.id} className="tbl-row border-b border-default last:border-0">
              <td className="px-5 py-3"><a href={`https://www.kubscan.com/tx/${encodeURIComponent(row.txId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs text-default hover:text-accent" title={row.txId} aria-label={`Open transaction ${row.txId} on KubScan`}>{compactAddress(row.txId)}<Icon name="external" size={12} /></a><div className="mt-1 text-[10px] text-faint">{row.flow.replaceAll('_', ' ')}</div></td>
              <td className="px-3 py-3"><span className={`pill ${row.type === 'Mint' ? 'pill-success' : row.type === 'Burn' ? 'pill-danger' : 'pill-muted'}`}>{row.type}</span></td>
              <td className="px-3 py-3"><AddressLink address={row.fromHash} name={row.fromName} /></td>
              <td className="px-3 py-3"><AddressLink address={row.toHash} name={row.toName} /></td>
              <td className="px-3 py-3 text-right"><span className="inline-flex items-center justify-end gap-2 font-mono text-xs text-default">{formatAmount(row.value)} {row.tokenSymbol}<TokenAvatar src={selectedOption?.imageUrl} symbol={row.tokenSymbol} size="sm" /></span></td>
              <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{formatTimestamp(row.timestamp, summary?.timezone ?? 'Asia/Bangkok')}</td>
              <td className="px-3 py-3"><span className={`pill ${['ok', 'success'].includes((row.status ?? '').toLowerCase()) ? 'pill-success' : 'pill-muted'}`}>{row.status ?? 'Unknown'}</span></td>
            </tr>)}</tbody>
          </table></div>
          <div className="flex flex-col items-start justify-between gap-3 border-t border-default px-5 py-3 text-xs text-muted sm:flex-row sm:items-center">
            <span>Page {transactions.page} of {transactions.totalPages} · {transactions.total.toLocaleString()} events</span>
            <div className="flex items-center gap-2"><button className="btn btn-ghost" aria-label="Previous transaction page" disabled={page <= 1 || tableLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}><Icon name="chevR" size={12} className="rotate-180" /> Previous</button><button className="btn btn-ghost" aria-label="Next transaction page" disabled={page >= transactions.totalPages || tableLoading} onClick={() => setPage((value) => Math.min(transactions.totalPages, value + 1))}>Next <Icon name="chevR" size={12} /></button></div>
          </div>
        </>}
      </Card>}
    </>}
    {annotationModal && <AnnotationModal annotations={annotations} editing={editingAnnotation} date={annotationDate} event={annotationEvent} error={annotationError} saving={annotationSaving} minDate={summary?.daily[0]?.date ?? ''} maxDate={summary?.daily.at(-1)?.date ?? ''} setDate={setAnnotationDate} setEvent={setAnnotationEvent} edit={(annotation) => { setEditingAnnotation(annotation); setAnnotationDate(annotation.date); setAnnotationEvent(annotation.event); setAnnotationError('') }} save={() => void saveAnnotation()} remove={(annotation) => void deleteAnnotation(annotation)} close={() => setAnnotationModal(false)} />}
  </div>
}

function TokenSelector({ tokens, value, disabled, onChange, label }: { tokens: TokenOption[]; value: string; disabled: boolean; onChange: (value: string) => void; label: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = tokens.find((token) => token.address.toLowerCase() === value.toLowerCase())
  const selectedIndex = Math.max(0, tokens.findIndex((token) => token.address.toLowerCase() === value.toLowerCase()))
  useEffect(() => {
    const close = (event: MouseEvent): void => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  function choose(index: number): void {
    const token = tokens[index]
    if (!token) return
    onChange(token.address); setActiveIndex(index); setOpen(false)
  }
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); setOpen(true); setActiveIndex(event.key === 'Home' ? 0 : Math.max(0, tokens.length - 1)); return
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(activeIndex); else { setActiveIndex(selectedIndex); setOpen(true) }; return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true)
      setActiveIndex((current) => event.key === 'ArrowDown' ? Math.min(tokens.length - 1, current + 1) : Math.max(0, current - 1))
    }
  }
  return <div ref={rootRef} className="relative flex min-w-0 flex-col gap-1 text-xs font-medium text-muted sm:w-64">
    <span id="kap22-token-label">{label}</span>
    <button type="button" className="input flex min-h-11 w-full items-center gap-2 text-left" aria-labelledby="kap22-token-label kap22-token-value" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => { if (!open) setActiveIndex(selectedIndex); setOpen((current) => !current) }} onKeyDown={handleKeyDown}>
      {selected ? <><TokenAvatar src={selected.imageUrl} symbol={selected.symbol} size="sm" /><span id="kap22-token-value" className="min-w-0 flex-1 truncate text-default">{cleanTokenName(selected.name, selected.symbol)}</span><span className="font-mono text-[11px] text-muted">{selected.symbol}</span></> : <span id="kap22-token-value" className="flex-1">No active KAP-22 tokens</span>}
      <Icon name="chevR" size={12} className={`shrink-0 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
    </button>
    {open && <ul role="listbox" aria-labelledby="kap22-token-label" className="glass-strong absolute left-0 top-full z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-default p-1 shadow-xl thin-scroll">
      {tokens.map((token, index) => <li key={token.address} role="option" aria-selected={token.address.toLowerCase() === value.toLowerCase()} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 ${index === activeIndex ? 'bg-white/10 text-default' : 'text-muted hover:bg-white/5 hover:text-default'}`} onMouseEnter={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}><TokenAvatar src={token.imageUrl} symbol={token.symbol} size="sm" /><span className="min-w-0 flex-1 truncate">{cleanTokenName(token.name, token.symbol)}</span><span className="font-mono text-[11px]">{token.symbol}</span></li>)}
    </ul>}
  </div>
}

function AnnotationModal({ annotations, editing, date, event, error, saving, minDate, maxDate, setDate, setEvent, edit, save, remove, close }: { annotations: ChartAnnotation[]; editing: ChartAnnotation | null; date: string; event: string; error: string; saving: boolean; minDate: string; maxDate: string; setDate: (value: string) => void; setEvent: (value: string) => void; edit: (annotation: ChartAnnotation) => void; save: () => void; remove: (annotation: ChartAnnotation) => void; close: () => void }): React.JSX.Element {
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="annotation-title">
    <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close event dialog" onClick={close} />
    <div className="glass-strong relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 thin-scroll sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 id="annotation-title" className="text-lg font-semibold text-default">Chart events</h2><p className="mt-1 text-xs text-muted">บันทึกเหตุการณ์หรือหมายเหตุเพื่อช่วยอธิบายข้อมูลบนกราฟรายวันทั้งสองกราฟ</p></div><button type="button" className="btn btn-ghost min-h-10" onClick={close}>Close</button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-xs font-medium text-muted">Date<input type="date" className="input" min={minDate} max={maxDate} value={date} onChange={(input) => setDate(input.target.value)} /></label><label className="space-y-2 text-xs font-medium text-muted sm:col-span-2">Event<textarea className="input min-h-24 resize-y" maxLength={500} value={event} onChange={(input) => setEvent(input.target.value)} placeholder="Describe the event…" /><span className="block text-right text-[10px] text-faint">{event.length}/500</span></label></div>
      {error && <p className="mt-3 rounded-xl border border-red-400/30 p-3 text-sm text-red-400" role="alert">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn btn-primary min-h-11" disabled={saving || !date || !event.trim()} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add event'}</button></div>
      <div className="mt-6 border-t border-default pt-5"><h3 className="text-sm font-semibold text-default">Saved events</h3>{annotations.length === 0 ? <p className="py-8 text-center text-sm text-muted">ยังไม่มีบันทึกประกอบกราฟ</p> : <ul className="mt-3 space-y-2">{annotations.map((annotation) => <li key={annotation.id} className="flex flex-col gap-3 rounded-xl border border-default p-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="font-mono text-xs text-muted">{annotation.date}</div><p className="mt-1 break-words text-sm text-default">{annotation.event}</p></div><div className="flex gap-2"><button type="button" className="btn btn-ghost min-h-10" disabled={saving} onClick={() => edit(annotation)}>Edit</button><button type="button" className="btn btn-ghost min-h-10 text-red-400" disabled={saving} onClick={() => remove(annotation)}>Delete</button></div></li>)}</ul>}</div>
    </div>
  </div>
}
