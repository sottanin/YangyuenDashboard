'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { NftRedemptionBarChart, type NftRedemptionBarPoint } from '@/components/charts/NftRedemptionBarChart'
import { Card } from '@/components/ui/Card'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Icon } from '@/components/ui/Icon'
import { KpiTile } from '@/components/ui/KpiTile'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonKpi, SkeletonTable } from '@/components/ui/SkeletonCard'
import { TokenAvatar } from '@/components/ui/TokenAvatar'
import { useWorkspace } from '@/lib/WorkspaceContext'
import { useChartPermissions } from '@/lib/ChartPermissionContext'
import { AddressLink } from '@/components/ui/AddressLink'
import { ReportFilters, type ReportTokenOption } from '@/components/reports/ReportFilters'
import type { ReportPeriod } from '@/lib/reporting/reportPeriod'

interface SummaryResponse { nftMint: number; nftBurn: number; nftSymbol: string; nftImageUrl: string | null; kap20Burn: string; kap20Fee: string; kap20Symbol: string; kap20ImageUrl: string | null; timezone: string }
interface TransactionRow {
  id: string
  txId: string
  timestamp: string
  type: 'Mint' | 'Burn' | 'Transfer'
  status: string | null
  tokenName: string
  tokenSymbol: string
  tokenId: string | null
  tokenValue: string | null
  imageUrl: string | null
  fromHash: string
  fromName: string | null
  toHash: string
  toName: string | null
}
interface TransactionsResponse { rows: TransactionRow[]; total: number; totalPages: number; page: number; limit: number }

const PAGE_SIZE = 20

function compactAddress(value: string): string { return `${value.slice(0, 7)}…${value.slice(-5)}` }
function formatAmount(value: string): string {
  const parsed = value.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!parsed) return value
  const [, sign, integer, fraction = ''] = parsed
  const decimal = fraction.slice(0, 4).replace(/0+$/, '')
  return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decimal ? `.${decimal}` : ''}`
}
function formatTimestamp(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
async function readResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json()
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Unable to load report'
    throw new Error(message)
  }
  return data as T
}
export default function NftRedemptionsPage(): React.JSX.Element {
  const { canViewChart } = useChartPermissions()
  const canViewNftMint = canViewChart('nft.nft-mint')
  const canViewNftBurn = canViewChart('nft.nft-burn')
  const canViewKap20Burn = canViewChart('nft.kap20-burn')
  const canViewKap20Fee = canViewChart('nft.kap20-fee')
  const canViewKpis = canViewNftMint || canViewNftBurn || canViewKap20Burn || canViewKap20Fee
  const canViewTopRedemptions = canViewChart('nft.top-redemptions')
  const canViewTopBurns = canViewChart('nft.top-burns')
  const canViewHistory = canViewChart('nft.transaction-history')
  const canViewRankings = canViewTopRedemptions || canViewTopBurns
  const hasVisibleContent = canViewKpis || canViewRankings || canViewHistory
  const { selected, loading: workspaceLoading } = useWorkspace()
  const workspace = String(selected.id)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [topNfts, setTopNfts] = useState<NftRedemptionBarPoint[]>([])
  const [topBurns, setTopBurns] = useState<NftRedemptionBarPoint[]>([])
  const [transactions, setTransactions] = useState<TransactionsResponse | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')
  const [chartError, setChartError] = useState('')
  const [tableError, setTableError] = useState('')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [tokens, setTokens] = useState<ReportTokenOption[]>([])
  const [selectedToken, setSelectedToken] = useState('')
  const [tokensLoading, setTokensLoading] = useState(true)
  const [tokensError, setTokensError] = useState('')
  const [tokenWorkspace, setTokenWorkspace] = useState('')
  const [period, setPeriod] = useState<ReportPeriod>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [historyStart, setHistoryStart] = useState('')
  const [today, setToday] = useState('')
  const requestIds = useRef({ summary: 0, chart: 0, table: 0 })
  const customError = period === 'custom' ? (!customFrom || !customTo ? 'Select both From and To dates.' : customFrom > customTo ? 'From date must be on or before To date.' : customTo > today ? 'To date cannot be in the future.' : customFrom < historyStart ? 'From date cannot be before the business history start.' : '') : ''
  const reportParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams({ workspace, token: selectedToken, period })
    if (period === 'custom') { params.set('from', customFrom); params.set('to', customTo) }
    return params
  }, [customFrom, customTo, period, selectedToken, workspace])

  const loadTokens = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setTokensLoading(true); setTokensError('')
    try {
      const data = await readResponse<{ tokens: ReportTokenOption[]; historyStart: string; today: string }>(await fetch(`/api/reports/nft-redemptions/tokens?workspace=${encodeURIComponent(workspace)}`, { signal }))
      setTokens(data.tokens); setTokenWorkspace(workspace); setHistoryStart(data.historyStart); setToday(data.today)
      const preferred = data.tokens.find((token) => token.symbol.toUpperCase() === 'ICCYYN') ?? data.tokens[0]
      setSelectedToken(preferred?.address ?? '')
    } catch (error) {
      if (!signal?.aborted) { setTokens([]); setSelectedToken(''); setTokenWorkspace(''); setTokensError(error instanceof Error ? error.message : 'Unable to load token options') }
    } finally { if (!signal?.aborted) setTokensLoading(false) }
  }, [workspace])

  const loadSummary = useCallback(async (signal?: AbortSignal): Promise<void> => {
    const id = ++requestIds.current.summary
    setSummaryLoading(true); setSummaryError('')
    try {
      const data = await readResponse<SummaryResponse>(await fetch(`/api/reports/nft-redemptions/summary?${reportParams()}`, { signal }))
      if (id === requestIds.current.summary) setSummary(data)
    } catch (error) {
      if (!signal?.aborted && id === requestIds.current.summary) { setSummary(null); setSummaryError(error instanceof Error ? error.message : 'Unable to load summary') }
    } finally { if (id === requestIds.current.summary) setSummaryLoading(false) }
  }, [reportParams])

  const loadChart = useCallback(async (signal?: AbortSignal): Promise<void> => {
    const id = ++requestIds.current.chart
    setChartLoading(true); setChartError('')
    try {
      const [redemptions, burns] = await Promise.all([
        canViewTopRedemptions ? readResponse<{ rows: NftRedemptionBarPoint[] }>(await fetch(`/api/reports/nft-redemptions/top-nfts?${reportParams()}`, { signal })) : Promise.resolve({ rows: [] }),
        canViewTopBurns ? readResponse<{ rows: NftRedemptionBarPoint[] }>(await fetch(`/api/reports/nft-redemptions/top-burns?${reportParams()}`, { signal })) : Promise.resolve({ rows: [] }),
      ])
      if (id === requestIds.current.chart) { setTopNfts(redemptions.rows); setTopBurns(burns.rows) }
    } catch (error) {
      if (!signal?.aborted && id === requestIds.current.chart) { setTopNfts([]); setTopBurns([]); setChartError(error instanceof Error ? error.message : 'Unable to load NFT rankings') }
    } finally { if (id === requestIds.current.chart) setChartLoading(false) }
  }, [canViewTopBurns, canViewTopRedemptions, reportParams])

  const loadTransactions = useCallback(async (requestedPage: number, requestedSearch: string, signal?: AbortSignal): Promise<void> => {
    const id = ++requestIds.current.table
    setTableLoading(true); setTableError('')
    const params = reportParams(); params.set('page', String(requestedPage)); params.set('limit', String(PAGE_SIZE))
    if (requestedSearch) params.set('search', requestedSearch)
    try {
      const data = await readResponse<TransactionsResponse>(await fetch(`/api/reports/nft-redemptions/transactions?${params}`, { signal }))
      if (id === requestIds.current.table) setTransactions(data)
    } catch (error) {
      if (!signal?.aborted && id === requestIds.current.table) { setTransactions(null); setTableError(error instanceof Error ? error.message : 'Unable to load transaction history') }
    } finally { if (id === requestIds.current.table) setTableLoading(false) }
  }, [reportParams])

  useEffect(() => {
    if (workspaceLoading || workspace === 'all') return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) { setPage(1); setSearchInput(''); setSearch(''); setSummary(null); setTopNfts([]); setTopBurns([]); setTransactions(null); setTokens([]); setTokenWorkspace(''); setSelectedToken(''); void loadTokens(controller.signal) } })
    return () => controller.abort()
  }, [loadTokens, workspace, workspaceLoading])

  useEffect(() => {
    if (workspaceLoading || !selectedToken || tokenWorkspace !== workspace || customError) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) { if (canViewKpis) void loadSummary(controller.signal); if (canViewRankings) void loadChart(controller.signal) } })
    return () => controller.abort()
  }, [canViewKpis, canViewRankings, customError, loadChart, loadSummary, selectedToken, tokenWorkspace, workspace, workspaceLoading])

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim().length >= 2 ? searchInput.trim() : ''); setPage(1) }, 375)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (workspaceLoading || !canViewHistory || !selectedToken || tokenWorkspace !== workspace || customError) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadTransactions(page, search, controller.signal) })
    return () => controller.abort()
  }, [canViewHistory, customError, workspaceLoading, page, search, loadTransactions, selectedToken, tokenWorkspace, workspace])

  return <div className="min-w-0 max-w-full">
    <PageHeader title="NFT Redemptions (KAP-721)" subtitle="ภาพรวมการสร้าง การใช้งาน NFT ยอดชำระ และค่าธรรมเนียม Marketplace" actions={hasVisibleContent ? <ReportFilters idPrefix="nft-redemptions" tokens={tokens} token={selectedToken} period={period} customFrom={customFrom} customTo={customTo} disabled={tokensLoading} minDate={historyStart} maxDate={today} onTokenChange={(value) => { setSelectedToken(value); setPage(1) }} onPeriodChange={(value) => { setPeriod(value); setPage(1) }} onCustomFromChange={(value) => { setCustomFrom(value); setPage(1) }} onCustomToChange={(value) => { setCustomTo(value); setPage(1) }} /> : undefined} />

    {tokensError ? <div className="mb-4"><ErrorCard message={tokensError} onRetry={() => void loadTokens()} /></div> : null}
    {customError ? <div className="mb-4" role="alert"><ErrorCard message={customError} /></div> : null}
    {!tokensLoading && !tokensError && tokens.length === 0 ? <Card><div className="py-12 text-center"><div className="text-sm font-medium text-default">No active KAP-20 tokens</div><p className="mt-1 text-xs text-muted">Add an active primary token contract in the registry.</p></div></Card> : null}

    {!hasVisibleContent ? <section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-default px-6 py-12 text-center"><h2 className="text-base font-semibold text-default">No report content available</h2><p className="mt-2 max-w-md text-sm text-muted">Your role allows access to this menu, but no charts or content are assigned. Contact an administrator if you need access.</p></section> : null}

    {canViewKpis && tokens.length > 0 && !customError && !tokensError && <div>{summaryError ? <div className="mb-4"><ErrorCard message={summaryError} onRetry={() => void loadSummary()} /></div> : summaryLoading || tokensLoading || !summary ? <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: [canViewNftMint, canViewNftBurn, canViewKap20Burn, canViewKap20Fee].filter(Boolean).length }, (_, index) => <SkeletonKpi key={index} />)}</div> : <section className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="NFT redemption key performance indicators">
      {canViewNftMint && <KpiTile label="NFT Mint" value={`${summary.nftMint.toLocaleString()} NFTs`} valueTrailing={<TokenAvatar src={summary.nftImageUrl} symbol={summary.nftSymbol} size="sm" />} icon="arrowUp" sparkColor="var(--success)" />}
      {canViewNftBurn && <KpiTile label="NFT Burn" value={`${summary.nftBurn.toLocaleString()} NFTs`} valueTrailing={<TokenAvatar src={summary.nftImageUrl} symbol={summary.nftSymbol} size="sm" />} icon="flame" sparkColor="var(--danger)" />}
      {canViewKap20Burn && <KpiTile label="Token (KAP-20) Burn" value={`${formatAmount(summary.kap20Burn)} ${summary.kap20Symbol}`} valueTrailing={<TokenAvatar src={summary.kap20ImageUrl} symbol={summary.kap20Symbol} size="sm" />} icon="refresh" sparkColor="var(--danger)" />}
      {canViewKap20Fee && <KpiTile label="Token (KAP-20) Fee" value={`${formatAmount(summary.kap20Fee)} ${summary.kap20Symbol}`} valueTrailing={<TokenAvatar src={summary.kap20ImageUrl} symbol={summary.kap20Symbol} size="sm" />} icon="target" sparkColor="var(--warn)" />}
    </section>}</div>}

    {canViewRankings && tokens.length > 0 && !customError && !tokensError && <section className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="NFT rankings">
      {canViewTopRedemptions && <Card title="Top 10 NFT Redemptions" subtitle="จัดอันดับ NFT 10 รายการที่ถูกแลกมากที่สุด โดยจัดกลุ่มจากชื่อ NFT">
        {chartError ? <ErrorCard message={chartError} onRetry={() => void loadChart()} /> : chartLoading ? <div className="h-[340px] shimmer rounded-xl" /> : topNfts.length === 0 ? <div className="flex h-[280px] items-center justify-center text-sm text-muted">No minted NFT redemption data found</div> : <NftRedemptionBarChart data={topNfts} />}
      </Card>}
      {canViewTopBurns && <Card title="Top 10 NFT Burn" subtitle="จัดอันดับ NFT 10 รายการที่ถูกใช้งานมากที่สุด โดยจัดกลุ่มจากชื่อ NFT">
        {chartError ? <ErrorCard message={chartError} onRetry={() => void loadChart()} /> : chartLoading ? <div className="h-[340px] shimmer rounded-xl" /> : topBurns.length === 0 ? <div className="flex h-[280px] items-center justify-center text-sm text-muted">No burned NFT data found</div> : <NftRedemptionBarChart data={topBurns} variant="burn" />}
      </Card>}
    </section>}

    {canViewHistory && tokens.length > 0 && !customError && !tokensError && <Card title="Transaction History" subtitle="ตารางแสดงธุรกรรม NFT ทั้งหมด พร้อม Token ID ผู้ส่ง ผู้รับ และสถานะธุรกรรม" noPad>
      <div className="border-b border-default p-4 sm:p-5">
        <label htmlFor="nft-redemption-search" className="sr-only">Search NFT redemption transactions</label>
        <div className="relative max-w-xl">
          <input id="nft-redemption-search" type="search" className="input w-full pl-3 pr-24" value={searchInput} maxLength={128} placeholder="Search TxId, Token ID, From or To wallet" onChange={(event) => setSearchInput(event.target.value)} />
          {searchInput ? <button type="button" className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-default" onClick={() => setSearchInput('')}>Clear</button> : null}
          <Icon name="search" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
        </div>
        {searchInput.trim().length === 1 ? <p className="mt-1.5 text-xs text-muted">Enter at least 2 characters to search.</p> : null}
      </div>
      {tableError ? <div className="p-5"><ErrorCard message={tableError} onRetry={() => void loadTransactions(page, search)} /></div> : tableLoading || !transactions ? <div className="p-5"><SkeletonTable rows={7} /></div> : transactions.rows.length === 0 ? <div className="py-16 text-center"><div className="text-sm font-medium text-default">No NFT transactions found</div><p className="mt-1 text-xs text-muted">{search ? `No results match “${search}”.` : 'Run NFT Redemption Sync to populate this report.'}</p></div> : <>
        <div className="w-full min-w-0 overflow-x-auto thin-scroll" tabIndex={0} role="region" aria-label="Scrollable NFT redemption transaction table"><table className="min-w-[1080px] w-full text-sm">
          <caption className="sr-only">NFT redemption transaction events</caption>
          <thead><tr className="border-b border-default text-[10.5px] uppercase tracking-wider text-faint"><th scope="col" className="px-5 py-3 text-left font-medium">Transaction</th><th scope="col" className="px-3 py-3 text-left font-medium">Type</th><th scope="col" className="px-3 py-3 text-left font-medium">From</th><th scope="col" className="px-3 py-3 text-left font-medium">To</th><th scope="col" className="px-3 py-3 text-left font-medium">NFT</th><th scope="col" className="px-3 py-3 text-left font-medium">Token ID</th><th scope="col" className="px-3 py-3 text-right font-medium">Token Value</th><th scope="col" className="px-3 py-3 text-right font-medium">Amount</th><th scope="col" className="px-3 py-3 text-left font-medium">Time</th><th scope="col" className="px-3 py-3 text-left font-medium">Status</th></tr></thead>
          <tbody>{transactions.rows.map((row) => <tr key={row.id} className="tbl-row border-b border-default last:border-0">
            <td className="px-5 py-3"><a href={`https://www.kubscan.com/tx/${encodeURIComponent(row.txId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs text-default hover:text-accent" title={row.txId}>{compactAddress(row.txId)}<Icon name="external" size={12} /></a></td>
            <td className="px-3 py-3"><span className={`pill ${row.type === 'Mint' ? 'pill-success' : row.type === 'Burn' ? 'pill-danger' : 'pill-muted'}`}>{row.type}</span></td>
            <td className="px-3 py-3"><AddressLink address={row.fromHash} name={row.fromName} /></td>
            <td className="px-3 py-3"><AddressLink address={row.toHash} name={row.toName} /></td>
            <td className="max-w-56 px-3 py-3 text-xs text-default"><div className="flex items-center gap-2"><TokenAvatar src={row.imageUrl} symbol={row.tokenSymbol || row.tokenName} size="md" className="h-7 w-7 rounded-lg" /><div className="min-w-0"><div className="truncate rounded font-medium focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" title={row.tokenName} aria-label={row.tokenName} tabIndex={0}>{row.tokenName}</div><div className="truncate text-[10px] text-muted" title={row.tokenSymbol}>{row.tokenSymbol}</div></div></div></td>
            <td className="px-3 py-3 font-mono text-xs text-default">{row.tokenId ?? '—'}</td>
            <td className="px-3 py-3 text-right font-mono text-xs text-default">{row.tokenValue ?? '—'}</td>
            <td className="px-3 py-3 text-right font-mono text-xs text-default">1 NFT</td>
            <td className="whitespace-nowrap px-3 py-3 text-xs text-muted"><time dateTime={row.timestamp} title={row.timestamp}>{formatTimestamp(row.timestamp, summary?.timezone ?? 'Asia/Bangkok')}</time></td>
            <td className="px-3 py-3"><span className={`pill ${['ok', 'success'].includes((row.status ?? '').toLowerCase()) ? 'pill-success' : 'pill-muted'}`}>{row.status ?? 'Unknown'}</span></td>
          </tr>)}</tbody>
        </table></div>
        <nav aria-label="NFT redemption transaction pages" className="flex flex-col items-start justify-between gap-3 border-t border-default px-5 py-3 text-xs text-muted sm:flex-row sm:items-center"><span aria-live="polite">Page {transactions.page} of {transactions.totalPages} · {transactions.total.toLocaleString()} events</span><div className="flex gap-2"><button className="btn btn-ghost min-h-11" aria-label="Previous transaction page" disabled={page <= 1 || tableLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}><Icon name="chevR" size={12} className="rotate-180" /> Previous</button><button className="btn btn-ghost min-h-11" aria-label="Next transaction page" disabled={page >= transactions.totalPages || tableLoading} onClick={() => setPage((value) => Math.min(transactions.totalPages, value + 1))}>Next <Icon name="chevR" size={12} /></button></div></nav>
      </>}
    </Card>}
  </div>
}
