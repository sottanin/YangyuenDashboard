'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Card } from '@/components/ui/Card'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Icon } from '@/components/ui/Icon'
import { KpiTile } from '@/components/ui/KpiTile'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonKpi, SkeletonTable } from '@/components/ui/SkeletonCard'
import { SingleLineChart, type SingleLinePoint } from '@/components/charts/SingleLineChart'
import { HorizontalBarChart, type HorizontalBarPoint } from '@/components/charts/HorizontalBarChart'
import { useWorkspace } from '@/lib/WorkspaceContext'
import { TokenAvatar } from '@/components/ui/TokenAvatar'

interface TokenOption { id: string; name: string; symbol: string; address: string; imageUrl: string | null }
interface ChartAnnotation { id: string; date: string; event: string; createdAt: string; updatedAt: string }
type Period = 'all' | 'week' | 'month' | '3months' | 'year' | 'custom'
interface SummaryResponse {
  token: TokenOption
  distributorPool: string
  operationPool: string
  mint: string
  transferToUsers: string
  burn: string
  reconciliationDelta: string
  reconciliationMatched: boolean
  daily: Array<{ date: string; totalTransactions: number; totalAmount: string }>
  timezone: string
  historyStart: string
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
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
function formatHistoryStart(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'medium' }).format(new Date(value))
}
async function responseJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json()
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Unable to load report'
    throw new Error(message)
  }
  return body as T
}

export interface TokenAnalysisPageProps { reportType?: 'kap20' | 'kap22' }
export default function Kap22AnalysisPage({ reportType = 'kap22' }: TokenAnalysisPageProps) {
  const isKap20 = reportType === 'kap20'
  const reportLabel = isKap20 ? 'KAP-20' : 'KAP-22'
  const apiBase = `/api/reports/${reportType}`
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
  const workspace = String(selected.id)

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
  }, [apiBase, isKap20, workspace])

  const loadSummary = useCallback(async (token: string, signal?: AbortSignal): Promise<void> => {
    const requestId = ++summaryRequest.current
    setSummaryLoading(true)
    setSummaryError('')
    setSummary(null)
    try {
      const response = await fetch(`${apiBase}/summary?token=${encodeURIComponent(token)}&workspace=${encodeURIComponent(workspace)}`, { signal })
      const data = await responseJson<SummaryResponse>(response)
      if (requestId === summaryRequest.current) setSummary(data)
    } catch (error) {
      if (signal?.aborted || requestId !== summaryRequest.current) return
      setSummaryError(error instanceof Error ? error.message : 'Unable to load summary')
    } finally {
      if (requestId === summaryRequest.current) setSummaryLoading(false)
    }
  }, [apiBase, workspace])

  const loadTransactions = useCallback(async (token: string, requestedPage: number, requestedSearch: string, signal?: AbortSignal): Promise<void> => {
    const requestId = ++tableRequest.current
    setTableLoading(true)
    setTableError('')
    try {
      const query = new URLSearchParams({ token, workspace, page: String(requestedPage), limit: String(PAGE_SIZE) })
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
  }, [apiBase, workspace])

  const loadTopUsers = useCallback(async (token: string, signal?: AbortSignal): Promise<void> => {
    const requestId = ++topUsersRequest.current
    setTopUsersLoading(true)
    setTopUsersError('')
    setTopUsers(null)
    try {
      const query = new URLSearchParams({ token, workspace })
      const response = await fetch(`${apiBase}/top-users?${query}`, { signal })
      const data = await responseJson<TopUsersResponse>(response)
      if (requestId === topUsersRequest.current) setTopUsers(data)
    } catch (error) {
      if (signal?.aborted || requestId !== topUsersRequest.current) return
      setTopUsersError(error instanceof Error ? error.message : 'Unable to load user rankings')
    } finally {
      if (requestId === topUsersRequest.current) setTopUsersLoading(false)
    }
  }, [apiBase, workspace])

  useEffect(() => {
    if (workspaceLoading) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadTokens(controller.signal) })
    return () => controller.abort()
  }, [loadTokens, workspaceLoading])

  useEffect(() => {
    if (!selectedToken) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      void loadSummary(selectedToken, controller.signal)
      void loadTopUsers(selectedToken, controller.signal)
    })
    return () => controller.abort()
  }, [selectedToken, loadSummary, loadTopUsers])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim()
      setSearch(trimmed.length >= 2 ? trimmed : '')
      setPage(1)
    }, 375)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!selectedToken) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadTransactions(selectedToken, page, search, controller.signal) })
    return () => controller.abort()
  }, [page, search, selectedToken, loadTransactions])

  const loadAnnotations = useCallback(async (token: string, signal?: AbortSignal): Promise<void> => {
    try {
      const response = await fetch(`${apiBase}/annotations?token=${encodeURIComponent(token)}&workspace=${encodeURIComponent(workspace)}`, { signal })
      const data = await responseJson<{ annotations: ChartAnnotation[] }>(response)
      setAnnotations(data.annotations)
    } catch (error) {
      if (!signal?.aborted) setAnnotationError(error instanceof Error ? error.message : 'Unable to load annotations')
    }
  }, [apiBase, workspace])

  useEffect(() => {
    if (!selectedToken) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadAnnotations(selectedToken, controller.signal) })
    return () => controller.abort()
  }, [selectedToken, loadAnnotations])

  function periodStart(end: string): string | null {
    if (period === 'all') return null
    if (period === 'custom') return customFrom || null
    const date = new Date(`${end}T00:00:00.000Z`)
    if (period === 'week') date.setUTCDate(date.getUTCDate() - 6)
    if (period === 'month') date.setUTCMonth(date.getUTCMonth() - 1)
    if (period === '3months') date.setUTCMonth(date.getUTCMonth() - 3)
    if (period === 'year') date.setUTCFullYear(date.getUTCFullYear() - 1)
    return date.toISOString().slice(0, 10)
  }
  const endDate = period === 'custom' ? customTo : summary?.daily.at(-1)?.date
  const customRangeInvalid = period === 'custom' && (!customFrom || !customTo || customFrom > customTo)
  const filteredDaily = customRangeInvalid ? [] : (summary?.daily ?? []).filter((point) => {
    const end = endDate ?? point.date
    const start = periodStart(end)
    return (!start || point.date >= start) && point.date <= end
  })
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
    setAnnotationSaving(true); setAnnotationError('')
    try {
      const response = await fetch(editingAnnotation ? `${apiBase}/annotations/${editingAnnotation.id}` : `${apiBase}/annotations`, { method: editingAnnotation ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: selectedToken, workspace, date: annotationDate, event: annotationEvent }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to save annotation')
      await loadAnnotations(selectedToken); setAnnotationModal(false)
    } catch (error) { setAnnotationError(error instanceof Error ? error.message : 'Unable to save annotation') }
    finally { setAnnotationSaving(false) }
  }
  async function deleteAnnotation(annotation: ChartAnnotation): Promise<void> {
    if (!window.confirm('Delete this annotation?')) return
    setAnnotationSaving(true); setAnnotationError('')
    try {
      const query = new URLSearchParams({ token: selectedToken, workspace })
      const response = await fetch(`${apiBase}/annotations/${annotation.id}?${query}`, { method: 'DELETE' })
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? 'Unable to delete annotation') }
      await loadAnnotations(selectedToken); setEditingAnnotation(null); setAnnotationDate(''); setAnnotationEvent('')
    } catch (error) { setAnnotationError(error instanceof Error ? error.message : 'Unable to delete annotation') }
    finally { setAnnotationSaving(false) }
  }

  return <div className="min-w-0 max-w-full">
    <PageHeader
      title={`${reportLabel} Analysis`}
      subtitle="Pool balances, mint and burn activity from the configured business history"
      actions={<div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
        <TokenSelector tokens={tokens} value={selectedToken} disabled={tokensLoading || tokens.length === 0} onChange={(value) => { setPage(1); setSearchInput(''); setSearch(''); setSelectedToken(value) }} />
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted sm:w-36" htmlFor="kap22-period">Period
          <select id="kap22-period" className="input min-h-11" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
            <option value="all">All-time</option><option value="week">1 Week</option><option value="month">1 Month</option><option value="3months">3 Months</option><option value="year">1 Year</option><option value="custom">Select dates</option>
          </select>
        </label>
        {period === 'custom' && <div className="flex min-w-0 items-end gap-2 sm:w-auto"><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted" htmlFor="kap22-from">From<input id="kap22-from" type="date" className="input min-h-11 min-w-0" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted" htmlFor="kap22-to">To<input id="kap22-to" type="date" className="input min-h-11 min-w-0" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label></div>}
        <button type="button" className="btn btn-primary min-h-11 self-end px-4" onClick={() => openAnnotation()}>+ Add event</button>
      </div>}
    />

    {tokensError ? <ErrorCard message={tokensError} onRetry={() => void loadTokens()} /> : tokens.length === 0 && !tokensLoading ? (
      <Card><div className="py-12 text-center"><div className="text-sm font-medium text-default">No active {reportLabel} tokens</div><p className="mt-1 text-xs text-muted">Add an active token contract in the registry.</p></div></Card>
    ) : <>
      {summaryError ? <div className="mb-4"><ErrorCard message={summaryError} onRetry={() => selectedToken && void loadSummary(selectedToken)} /></div> : summaryLoading || !summary ? (
        <section aria-label="KAP-22 key performance indicators" aria-live="polite" className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((key) => <SkeletonKpi key={key} />)}</section>
      ) : <section aria-label="KAP-22 key performance indicators" aria-live="polite" className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile label="Mint" value={`${formatAmount(summary.mint)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="arrowUp" sparkColor="var(--success)" />
        <KpiTile label={isKap20 ? 'Initial Mint Wallet' : 'DistributorPool'} value={`${formatAmount(summary.distributorPool)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="box" />
        <KpiTile label={isKap20 ? 'Main Wallet' : 'OperationPool'} value={`${formatAmount(summary.operationPool)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="target" sparkColor="var(--accent-3)" />
        <KpiTile label="User Wallet" value={`${formatAmount(summary.transferToUsers)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="users" sparkColor="var(--accent-2)" />
        <KpiTile label={isKap20 ? 'KAP-20 Redemption' : 'Burn Wallet'} value={`${formatAmount(summary.burn)} ${summary.token.symbol}`} valueTrailing={<TokenAvatar src={summary.token.imageUrl} symbol={summary.token.symbol} size="sm" />} icon="refresh" sparkColor="var(--danger)" />
      </section>}

      {summary && !summary.reconciliationMatched ? <div className="mb-4" role="status">
        <ErrorCard message={`KAP-22 reconciliation mismatch: ${formatAmount(summary.reconciliationDelta)} ${summary.token.symbol}`} />
      </div> : null}

      <div className="mb-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 max-w-full" title="Daily Transactions" subtitle={`${selectedOption?.symbol ?? 'KAP-22'} · ${summary?.timezone ?? 'Asia/Bangkok'}${summary ? ` · since ${formatHistoryStart(summary.historyStart, summary.timezone)}` : ''}`}>
          {customRangeInvalid ? <div className="flex h-[300px] items-center justify-center text-sm text-red-400">Select a valid From and To date.</div> : summaryLoading ? <div className="h-[300px] shimmer rounded-xl" /> : transactionChartData.length === 0 ? <div className="flex h-[300px] items-center justify-center text-sm text-muted">No transfer history found</div> : <SingleLineChart data={transactionChartData} label="Total transactions" tooltipUnit="transactions" averageUnit="transactions" valueKind="count" color="var(--success)" />}
        </Card>
        <Card className="min-w-0 max-w-full" title="Daily Amount Transfer" subtitle={`${selectedOption?.symbol ?? 'KAP-22'} · ${summary?.timezone ?? 'Asia/Bangkok'}${summary ? ` · since ${formatHistoryStart(summary.historyStart, summary.timezone)}` : ''}`}>
          {customRangeInvalid ? <div className="flex h-[300px] items-center justify-center text-sm text-red-400">Select a valid From and To date.</div> : summaryLoading ? <div className="h-[300px] shimmer rounded-xl" /> : amountChartData.length === 0 ? <div className="flex h-[300px] items-center justify-center text-sm text-muted">No transfer history found</div> : <SingleLineChart data={amountChartData} label={`Total amount (${summary?.token.symbol ?? 'KAP-22'})`} tooltipUnit={`amounts (${summary?.token.symbol ?? 'KAP-22'})`} averageUnit={summary?.token.symbol ?? 'KAP-22'} valueKind="amount" color="var(--danger)" />}
        </Card>
      </div>

      <div className="mb-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 max-w-full" title="Top 10 Users by Tokens Received" subtitle={`${selectedOption?.symbol ?? 'KAP-22'} · all-time pool transfers`}>
          {topUsersError ? <ErrorCard message={topUsersError} onRetry={() => selectedToken && void loadTopUsers(selectedToken)} /> : topUsersLoading || !topUsers ? <div className="h-[336px] shimmer rounded-xl" /> : topUsers.topReceived.length === 0 ? <div className="flex h-[336px] items-center justify-center text-center text-sm text-muted">No user transfers found</div> : <HorizontalBarChart data={topUsers.topReceived} symbol={topUsers.token.symbol} color="var(--accent)" ariaLabel={`Top 10 users by total ${topUsers.token.symbol} received`} />}
        </Card>
        <Card className="min-w-0 max-w-full" title="Top 10 Users by Token Balance" subtitle={`${selectedOption?.symbol ?? 'KAP-22'} · latest synchronized on-chain balance`}>
          {topUsersError ? <ErrorCard message={topUsersError} onRetry={() => selectedToken && void loadTopUsers(selectedToken)} /> : topUsersLoading || !topUsers ? <div className="h-[336px] shimmer rounded-xl" /> : topUsers.topBalances.length === 0 ? <div className="flex h-[336px] items-center justify-center text-center text-sm text-muted">No positive synchronized on-chain balances found</div> : <HorizontalBarChart data={topUsers.topBalances} symbol={topUsers.token.symbol} color="var(--success)" ariaLabel={`Top 10 users by latest synchronized on-chain ${topUsers.token.symbol} balance`} />}
        </Card>
      </div>

      <Card className="min-w-0 max-w-full" title={`${reportLabel} Transactions`} subtitle={`${selectedOption?.name ?? 'Selected token'} · latest events first`} noPad>
        <div className="border-b border-default p-4 sm:p-5">
          <label htmlFor="kap22-transaction-search" className="sr-only">Search KAP-22 transactions</label>
          <div className="relative max-w-xl">
            <input id="kap22-transaction-search" type="search" className="input w-full pl-3 pr-24" value={searchInput} maxLength={128} placeholder="Search TxId, From or To wallet address" onChange={(event) => setSearchInput(event.target.value)} />
            {searchInput ? <button type="button" className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-default" onClick={() => setSearchInput('')}>Clear</button> : null}
            <Icon name="search" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
          </div>
          {searchInput.trim().length === 1 ? <p className="mt-1.5 text-xs text-muted">Enter at least 2 characters to search.</p> : null}
        </div>
        {tableError ? <div className="p-5"><ErrorCard message={tableError} onRetry={() => selectedToken && void loadTransactions(selectedToken, page, search)} /></div> : tableLoading || !transactions ? <div className="p-5"><SkeletonTable rows={7} /></div> : transactions.rows.length === 0 ? (
          <div className="py-16 text-center"><div className="text-sm font-medium text-default">No transactions found</div><p className="mt-1 text-xs text-muted">{search ? `No results match “${search}”.` : 'No events exist for this token in the selected workspace scope.'}</p>{search ? <button type="button" className="btn btn-ghost mt-4" onClick={() => setSearchInput('')}>Clear search</button> : null}</div>
        ) : <>
          <div className="w-full min-w-0 max-w-full overflow-x-auto thin-scroll [contain:inline-size]" tabIndex={0} role="region" aria-label="Scrollable KAP-22 transaction table"><table className="min-w-[920px] w-full text-sm">
            <caption className="sr-only">KAP-22 transaction events for {selectedOption?.name ?? 'the selected token'}</caption>
            <thead><tr className="border-b border-default text-[10.5px] uppercase tracking-wider text-faint">
              <th scope="col" className="px-5 py-3 text-left font-medium">Transaction</th><th scope="col" className="px-3 py-3 text-left font-medium">Type</th><th scope="col" className="px-3 py-3 text-left font-medium">From</th><th scope="col" className="px-3 py-3 text-left font-medium">To</th><th scope="col" className="px-3 py-3 text-right font-medium">Amount</th><th scope="col" className="px-3 py-3 text-left font-medium">Time</th><th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
            </tr></thead>
            <tbody>{transactions.rows.map((row) => <tr key={row.key || row.id} className="tbl-row border-b border-default last:border-0">
              <td className="px-5 py-3"><a href={`https://www.kubscan.com/tx/${encodeURIComponent(row.txId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs text-default hover:text-accent" title={row.txId} aria-label={`Open transaction ${row.txId} on KubScan`}>{compactAddress(row.txId)}<Icon name="external" size={12} /></a><div className="mt-1 text-[10px] text-faint">{row.flow.replaceAll('_', ' ')}</div></td>
              <td className="px-3 py-3"><span className={`pill ${row.type === 'Mint' ? 'pill-success' : row.type === 'Burn' ? 'pill-danger' : 'pill-muted'}`}>{row.type}</span></td>
              <td className="px-3 py-3"><a href={`https://www.kubscan.com/address/${encodeURIComponent(row.fromHash)}?tab=token_transfers`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent ${row.fromName ? 'font-medium' : 'font-mono'}`} title={row.fromName ? `${row.fromName} — ${row.fromHash}` : row.fromHash} aria-label={`Open From wallet ${row.fromName ? `${row.fromName}, ` : ''}${row.fromHash} on KubScan`}>{row.fromName ?? compactAddress(row.fromHash)}<Icon name="external" size={12} /></a></td>
              <td className="px-3 py-3"><a href={`https://www.kubscan.com/address/${encodeURIComponent(row.toHash)}?tab=token_transfers`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent ${row.toName ? 'font-medium' : 'font-mono'}`} title={row.toName ? `${row.toName} — ${row.toHash}` : row.toHash} aria-label={`Open To wallet ${row.toName ? `${row.toName}, ` : ''}${row.toHash} on KubScan`}>{row.toName ?? compactAddress(row.toHash)}<Icon name="external" size={12} /></a></td>
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
      </Card>
    </>}
    {annotationModal && <AnnotationModal annotations={annotations} editing={editingAnnotation} date={annotationDate} event={annotationEvent} error={annotationError} saving={annotationSaving} minDate={summary?.daily[0]?.date ?? ''} maxDate={summary?.daily.at(-1)?.date ?? ''} setDate={setAnnotationDate} setEvent={setAnnotationEvent} edit={(annotation) => { setEditingAnnotation(annotation); setAnnotationDate(annotation.date); setAnnotationEvent(annotation.event); setAnnotationError('') }} save={() => void saveAnnotation()} remove={(annotation) => void deleteAnnotation(annotation)} close={() => setAnnotationModal(false)} />}
  </div>
}

function TokenSelector({ tokens, value, disabled, onChange }: { tokens: TokenOption[]; value: string; disabled: boolean; onChange: (value: string) => void }): React.JSX.Element {
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
    <span id="kap22-token-label">Point Token</span>
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
      <div className="flex items-start justify-between gap-4"><div><h2 id="annotation-title" className="text-lg font-semibold text-default">Chart events</h2><p className="mt-1 text-xs text-muted">Record context that appears on both daily charts.</p></div><button type="button" className="btn btn-ghost min-h-10" onClick={close}>Close</button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-xs font-medium text-muted">Date<input type="date" className="input" min={minDate} max={maxDate} value={date} onChange={(input) => setDate(input.target.value)} /></label><label className="space-y-2 text-xs font-medium text-muted sm:col-span-2">Event<textarea className="input min-h-24 resize-y" maxLength={500} value={event} onChange={(input) => setEvent(input.target.value)} placeholder="Describe the event…" /><span className="block text-right text-[10px] text-faint">{event.length}/500</span></label></div>
      {error && <p className="mt-3 rounded-xl border border-red-400/30 p-3 text-sm text-red-400" role="alert">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn btn-primary min-h-11" disabled={saving || !date || !event.trim()} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add event'}</button></div>
      <div className="mt-6 border-t border-default pt-5"><h3 className="text-sm font-semibold text-default">Saved events</h3>{annotations.length === 0 ? <p className="py-8 text-center text-sm text-muted">No annotations recorded.</p> : <ul className="mt-3 space-y-2">{annotations.map((annotation) => <li key={annotation.id} className="flex flex-col gap-3 rounded-xl border border-default p-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="font-mono text-xs text-muted">{annotation.date}</div><p className="mt-1 break-words text-sm text-default">{annotation.event}</p></div><div className="flex gap-2"><button type="button" className="btn btn-ghost min-h-10" disabled={saving} onClick={() => edit(annotation)}>Edit</button><button type="button" className="btn btn-ghost min-h-10 text-red-400" disabled={saving} onClick={() => remove(annotation)}>Delete</button></div></li>)}</ul>}</div>
    </div>
  </div>
}
