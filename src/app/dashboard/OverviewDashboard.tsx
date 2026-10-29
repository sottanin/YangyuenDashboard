'use client'

import { ComparisonTag } from '@/components/ui/ComparisonTag'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TransactionTimelineChart, type TransactionTimelineGranularity, type TransactionTimelinePoint } from '@/components/charts/TransactionTimelineChart'
import { Card } from '@/components/ui/Card'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Icon } from '@/components/ui/Icon'
import { KpiTile } from '@/components/ui/KpiTile'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonCard, SkeletonKpi, SkeletonTable } from '@/components/ui/SkeletonCard'
import { TokenAvatar } from '@/components/ui/TokenAvatar'
import { AddressLink } from '@/components/ui/AddressLink'
import { useWorkspace } from '@/lib/WorkspaceContext'
import { useChartPermissions } from '@/lib/ChartPermissionContext'
import { ReportScope } from '@/components/reports/ReportScope'
import { ReportFilters, type ReportTokenOption } from '@/components/reports/ReportFilters'
import type { ReportPeriod } from '@/lib/reporting/reportPeriod'

interface Metric { value: string; change: number | null; changeLabel?: string; imageUrl?: string | null; symbol?: string }
interface Row { key: string; txId: string; timestamp: string; fromHash: string; toHash: string; fromName: string | null; toName: string | null; tokenName: string; tokenSymbol: string; standard: string; type: string; value: string; tokenId: string | null; status: string | null; imageUrl: string | null }
interface Report { timezone: string; period: { from: string; to: string }; dataThrough: string | null; comparison: {from: string; to: string} | null; kpis: { totalTransactions: Metric; dailyGasFee: Metric; totalGasFee: Metric; kap20Distributed: Metric; kap20Redeemed: Metric; redemptionFee: Metric; kap22: Array<Metric & { symbol: string }>; nftMint: Metric; nftBurn: Metric }; timeline: { monthly: TransactionTimelinePoint[]; daily: TransactionTimelinePoint[] }; transactions: { rows: Row[]; total: number; page: number; totalPages: number } }

const compact = (value: string): string => value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value
function formatAmount(value: string): string { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 4 }) : value }
function formatKub(value: string): string { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : value }

export function OverviewDashboard(): React.JSX.Element {
  const { canViewChart } = useChartPermissions()
  const canViewTotalTransactions = canViewChart('overview.total-transactions')
  const canViewTotalGasFee = canViewChart('overview.total-gas-fee')
  const canViewTokenDistributed = canViewChart('overview.token-distributed')
  const canViewTokenRedeemed = canViewChart('overview.token-redeemed')
  const canViewRedemptionFee = canViewChart('overview.redemption-fee')
  const canViewNftMint = canViewChart('overview.nft-mint')
  const canViewNftBurn = canViewChart('overview.nft-burn')
  const canViewPointTokenDistributed = canViewChart('overview.point-token-distributed')
  const canViewKpis = canViewTotalTransactions || canViewTotalGasFee || canViewTokenDistributed || canViewTokenRedeemed || canViewRedemptionFee || canViewNftMint || canViewNftBurn || canViewPointTokenDistributed
  const canViewMonthly = canViewChart('overview.monthly-transactions')
  const canViewHistory = canViewChart('overview.transaction-history')
  const hasVisibleContent = canViewKpis || canViewMonthly || canViewHistory
  const { selected, loading: workspaceLoading } = useWorkspace()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [tokens, setTokens] = useState<ReportTokenOption[]>([])
  const [selectedToken, setSelectedToken] = useState('')
  const [tokensLoading, setTokensLoading] = useState(true)
  const [tokensError, setTokensError] = useState('')
  const [tokenWorkspace, setTokenWorkspace] = useState('')
  const [period, setPeriod] = useState<ReportPeriod>('all')
  const [granularity, setGranularity] = useState<TransactionTimelineGranularity>('monthly')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [historyStart, setHistoryStart] = useState('')
  const [today, setToday] = useState('')
  const requestId = useRef(0)
  const customError = period === 'custom' ? (!customFrom || !customTo ? 'กรุณาเลือกวันเริ่มต้นและวันสิ้นสุด' : customFrom > customTo ? 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด' : customTo > today ? 'วันสิ้นสุดต้องไม่เกินวันนี้' : customFrom < historyStart ? 'From date cannot be before the business history start.' : '') : ''
  const loadTokens = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setTokensLoading(true); setTokensError('')
    try {
      const response = await fetch(`/api/reports/overview/tokens?workspace=${encodeURIComponent(String(selected.id))}`, { signal })
      const body = await response.json() as { tokens?: ReportTokenOption[]; historyStart?: string; today?: string; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Unable to load token options')
      const options = body.tokens ?? []
      setTokens(options); setTokenWorkspace(String(selected.id)); setHistoryStart(body.historyStart ?? ''); setToday(body.today ?? '')
      const preferred = options.find((token) => token.symbol.toUpperCase() === 'ICCYYN') ?? options[0]
      setSelectedToken(preferred?.address ?? '')
    } catch (reason) {
      if (!signal?.aborted) { setTokens([]); setSelectedToken(''); setTokenWorkspace(''); setTokensError(reason instanceof Error ? reason.message : 'Unable to load token options') }
    } finally { if (!signal?.aborted) setTokensLoading(false) }
  }, [selected.id])
  useEffect(() => { queueMicrotask(() => { setPage(1); setSearchInput(''); setSearch('') }) }, [selected.id])
  useEffect(() => {
    if (workspaceLoading || selected.id === 'all' || !hasVisibleContent) return
    const controller = new AbortController()
    queueMicrotask(() => { setReport(null); setError(''); setTokens([]); setTokenWorkspace(''); setSelectedToken(''); void loadTokens(controller.signal) })
    return () => controller.abort()
  }, [hasVisibleContent, loadTokens, selected.id, workspaceLoading])
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim().length >= 2 ? searchInput.trim() : ''); setPage(1) }, 350); return () => window.clearTimeout(timer) }, [searchInput])
  useEffect(() => {
    if (workspaceLoading || selected.id === 'all' || !hasVisibleContent || !selectedToken || tokenWorkspace !== String(selected.id) || customError) return
    const controller = new AbortController()
    const currentRequest = ++requestId.current
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setError(''); setReport(null) } })
    const query = new URLSearchParams({ workspace: String(selected.id), token: selectedToken, period, page: String(page) }); if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) }; if (search) query.set('search', search)
    fetch(`/api/reports/overview?${query}`, { signal: controller.signal }).then(async (response) => { const body: unknown = await response.json(); if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Unable to load overview'); return body as Report }).then((body) => { if (!controller.signal.aborted && currentRequest === requestId.current) setReport(body) }).catch((reason: unknown) => { if (!controller.signal.aborted && currentRequest === requestId.current) { setReport(null); setError(reason instanceof Error ? reason.message : 'Unable to load overview') } }).finally(() => { if (!controller.signal.aborted && currentRequest === requestId.current) setLoading(false) })
    return () => controller.abort()
  }, [customError, customFrom, customTo, hasVisibleContent, page, period, reload, search, selected.id, selectedToken, tokenWorkspace, workspaceLoading])
  return <div className="min-w-0 max-w-full"><PageHeader title="Overview" subtitle={`ภาพรวมกิจกรรมบนบล็อกเชนของ Workspace · ${selected.name}`} actions={hasVisibleContent ? <ReportFilters idPrefix="overview" tokens={tokens} token={selectedToken} period={period} customFrom={customFrom} customTo={customTo} disabled={tokensLoading} minDate={historyStart} maxDate={today} onTokenChange={(value) => { setSelectedToken(value); setPage(1) }} onPeriodChange={(value) => { setPeriod(value); setPage(1) }} onCustomFromChange={(value) => { setCustomFrom(value); setPage(1) }} onCustomToChange={(value) => { setCustomTo(value); setPage(1) }} /> : undefined} />
    {tokensError ? <div className="mb-4"><ErrorCard message={tokensError} onRetry={() => void loadTokens()} /></div> : null}
    {customError ? <div className="mb-4" role="alert"><ErrorCard message={customError} /></div> : null}
    {!tokensLoading && !tokensError && tokens.length === 0 ? <Card><div className="py-12 text-center"><div className="text-sm font-medium text-default">ยังไม่มีโทเคน KAP-20 ที่เปิดใช้งาน</div><p className="mt-1 text-xs text-muted">กรุณาให้ผู้ดูแลเพิ่มโทเคนหลักที่เปิดใช้งานก่อนดูรายงาน</p></div></Card> : null}
    {!hasVisibleContent ? <section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-default px-6 py-12 text-center"><h2 className="text-base font-semibold text-default">ยังไม่มีรายงานให้แสดง</h2><p className="mt-2 max-w-md text-sm text-muted">คุณเปิดเมนูนี้ได้ แต่ยังไม่ได้รับสิทธิ์ดูกราฟหรือข้อมูล กรุณาติดต่อผู้ดูแลหากต้องการใช้งาน</p></section> : null}
    {error ? <div className="mb-4"><ErrorCard message={error} onRetry={() => setReload((value) => value + 1)} /></div> : null}
    {hasVisibleContent && tokens.length > 0 && !customError && !tokensError && (loading || tokensLoading || !report) ? <div aria-busy="true"><div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <SkeletonKpi key={index} />)}</div>{canViewMonthly ? <SkeletonCard height={400} /> : null}</div> : report && !customError ? <>
      <ReportScope from={report.period.from} to={report.period.to} timezone={report.timezone} dataThrough={report.dataThrough} comparisonNote={report.comparison ? `เทียบกับช่วง ${report.comparison.from} ถึง ${report.comparison.to} ข้อมูลของวันหรือเดือนปัจจุบันอาจยังไม่ครบ` : 'แสดงข้อมูลทั้งหมด หรือยังไม่มีข้อมูลช่วงก่อนหน้าที่นำมาเทียบได้'} scopeNote="ยอดรวมตามช่วงวันที่เลือก นับธุรกรรมเดียวเพียงครั้งเดียว แม้เกี่ยวข้องกับโทเคนหลายประเภท ส่วนตารางแสดงรายการโอนแต่ละรายการ" />
      {canViewKpis && <section aria-label="Primary business metrics" className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canViewTotalTransactions && <KpiTile label="Total Transactions" subLabel="จำนวนธุรกรรมในช่วงวันที่เลือก นับธุรกรรมเดียวเพียงครั้งเดียว" value={formatAmount(report.kpis.totalTransactions.value)} change={report.kpis.totalTransactions.change} changeLabel={report.kpis.totalTransactions.changeLabel} icon="pulse" />}
        {canViewTokenDistributed && <KpiTile label="Token Distributed" subLabel="จำนวนโทเคนที่โอนให้ผู้ใช้ในช่วงวันที่เลือก" value={`${formatAmount(report.kpis.kap20Distributed.value)} ${report.kpis.kap20Distributed.symbol ?? 'KAP-20'}`} valueTrailing={<TokenAvatar src={report.kpis.kap20Distributed.imageUrl} symbol={report.kpis.kap20Distributed.symbol ?? 'KAP-20'} size="sm" />} change={report.kpis.kap20Distributed.change} changeLabel={report.kpis.kap20Distributed.changeLabel} icon="users" />}
        {canViewTokenRedeemed && <KpiTile label="Marketplace redemption paid (net)" subLabel="โทเคนที่ใช้แลกสิทธิ์ในช่วงวันที่เลือก ไม่รวมค่าธรรมเนียม" value={`${formatAmount(report.kpis.kap20Redeemed.value)} ${report.kpis.kap20Redeemed.symbol ?? 'KAP-20'}`} valueTrailing={<TokenAvatar src={report.kpis.kap20Redeemed.imageUrl} symbol={report.kpis.kap20Redeemed.symbol ?? 'KAP-20'} size="sm" />} change={report.kpis.kap20Redeemed.change} changeLabel={report.kpis.kap20Redeemed.changeLabel} icon="cart" />}
        {canViewNftMint && <KpiTile label="Vouchers issued (Mint)" subLabel="จำนวน voucher ที่ออกให้ผู้ใช้ในช่วงวันที่เลือก" value={`${formatAmount(report.kpis.nftMint.value)} NFTs`} valueTrailing={<TokenAvatar src={report.kpis.nftMint.imageUrl} symbol="NFT" size="sm" />} change={report.kpis.nftMint.change} changeLabel={report.kpis.nftMint.changeLabel} icon="arrowUp" />}
        {canViewNftBurn && <KpiTile label="Vouchers used (Burn)" subLabel="จำนวน voucher ที่ใช้แล้วในช่วงวันที่เลือก" value={`${formatAmount(report.kpis.nftBurn.value)} NFTs`} valueTrailing={<TokenAvatar src={report.kpis.nftBurn.imageUrl} symbol="NFT" size="sm" />} change={report.kpis.nftBurn.change} changeLabel={report.kpis.nftBurn.changeLabel} icon="refresh" />}
      </section>}
      {canViewMonthly && <Card className="mb-4" title="Total Transactions" subtitle="จำนวนธุรกรรมไม่ซ้ำตามช่วงวันที่เลือก ผลรวมตรงกับ KPI Total Transactions · วันหรือเดือนปัจจุบันอาจยังมีข้อมูลไม่ครบ"><TransactionTimelineChart monthly={report.timeline.monthly} daily={report.timeline.daily} granularity={granularity} onGranularityChange={setGranularity} height={300} /></Card>}
      {canViewPointTokenDistributed && <Card className="mb-4" title="Point tokens distributed" subtitle="จำนวนคะแนนที่แจกในช่วงวันที่เลือก แสดงแยกแต่ละโทเคนเพื่อให้เปรียบเทียบได้ชัดเจน ไม่นำยอดต่างโทเคนมารวมกัน"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{report.kpis.kap22.map((metric) => <div key={metric.symbol} className="rounded-xl border border-default p-3"><div className="flex items-center gap-2 text-xs text-muted"><TokenAvatar src={metric.imageUrl} symbol={metric.symbol} size="sm" />{metric.symbol}</div><div className="mt-2 break-words font-mono text-lg font-semibold text-default">{formatAmount(metric.value)} {metric.symbol}</div><div className="mt-1"><ComparisonTag change={metric.change} label={metric.changeLabel} /></div></div>)}</div></Card>}
      {(canViewTotalGasFee || canViewRedemptionFee) && <section aria-label="Operational costs" className="mb-4 grid gap-4 sm:grid-cols-2">
        {canViewTotalGasFee && <KpiTile label="Total Gas Fee" subLabel="ค่าธรรมเนียมเครือข่ายรวมของธุรกรรมในช่วงวันที่เลือก" value={`${formatKub(report.kpis.totalGasFee.value)} KUB`} valueTrailing={<TokenAvatar src="/assets/tokens/kub.png" symbol="KUB" size="sm" />} icon="zap" />}
        {canViewRedemptionFee && <KpiTile label="Redemption Fee" subLabel="ค่าธรรมเนียมการแลกสิทธิ์ในช่วงวันที่เลือก" value={`${formatAmount(report.kpis.redemptionFee.value)} ${report.kpis.redemptionFee.symbol ?? 'KAP-20'}`} valueTrailing={<TokenAvatar src={report.kpis.redemptionFee.imageUrl} symbol={report.kpis.redemptionFee.symbol ?? 'KAP-20'} size="sm" />} icon="target" />}
      </section>}
      {canViewHistory && <History report={report} page={page} setPage={setPage} searchInput={searchInput} setSearchInput={setSearchInput} />}
    </> : null}
    {hasVisibleContent && !loading && !report && !error ? <SkeletonTable rows={6} /> : null}
  </div>
}

function History({ report, page, setPage, searchInput, setSearchInput }: { report: Report; page: number; setPage: (page: number) => void; searchInput: string; setSearchInput: (value: string) => void }): React.JSX.Element {
  return <Card title="Transaction Events" subtitle="ดูรายละเอียดการโอนโทเคนและ NFT ในช่วงวันที่เลือก โดยธุรกรรมหนึ่งอาจมีหลายรายการโอน" noPad><div className="border-b border-default p-5"><div className="relative max-w-xl"><input className="input w-full pr-10" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search TxId, wallet, token or Token ID" aria-label="Search transaction history" /><Icon name="search" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" /></div></div>
    {report.transactions.rows.length === 0 ? <div className="py-16 text-center text-sm text-muted">ไม่พบรายการในช่วงนี้</div> : <div className="overflow-x-auto thin-scroll"><table className="min-w-[1120px] w-full text-sm"><thead><tr className="border-b border-default text-[10.5px] uppercase tracking-wider text-faint">{['Transaction', 'Standard', 'Type', 'From', 'To', 'Token', 'Token ID', 'Amount', 'Date', 'Status'].map((label) => <th key={label} className="px-3 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{report.transactions.rows.map((row) => <tr key={row.key} className="tbl-row border-b border-default last:border-0"><td className="px-3 py-3"><a href={`https://www.kubscan.com/tx/${encodeURIComponent(row.txId)}`} target="_blank" rel="noopener noreferrer" title={row.txId} className="inline-flex items-center gap-1 font-mono text-xs text-default hover:text-accent">{compact(row.txId)}<Icon name="external" size={11} /></a></td><td className="px-3 py-3"><span className="pill pill-accent">{row.standard}</span></td><td className="px-3 py-3"><span className={`pill ${row.type === 'Mint' ? 'pill-success' : row.type === 'Burn' ? 'pill-danger' : 'pill-muted'}`}>{row.type}</span></td><Address address={row.fromHash} name={row.fromName} /><Address address={row.toHash} name={row.toName} /><td className="px-3 py-3 text-xs" title={row.tokenName}><span className="inline-flex items-center gap-2"><TokenAvatar src={row.imageUrl} symbol={row.tokenSymbol || 'NFT'} size="sm" />{row.tokenSymbol || row.tokenName}</span></td><td className="px-3 py-3 font-mono text-xs text-muted">{row.tokenId ?? '—'}</td><td className="px-3 py-3 text-right font-mono text-xs">{formatAmount(row.value)} {row.tokenSymbol}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{new Intl.DateTimeFormat('th-TH', { timeZone: report.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.timestamp))}</td><td className="px-3 py-3"><span className={`pill ${['ok', 'success'].includes((row.status ?? '').toLowerCase()) ? 'pill-success' : 'pill-muted'}`}>{row.status ?? 'Unknown'}</span></td></tr>)}</tbody></table></div>}
    <div className="flex items-center justify-between border-t border-default px-5 py-3 text-xs text-muted"><span>Page {report.transactions.page} of {report.transactions.totalPages} · {report.transactions.total.toLocaleString()} events</span><div className="flex gap-2"><button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn btn-ghost" disabled={page >= report.transactions.totalPages} onClick={() => setPage(page + 1)}>Next</button></div></div></Card>
}
function Address({ address, name }: { address: string; name: string | null }): React.JSX.Element { return <td className="px-3 py-3"><AddressLink address={address} name={name} tab="tokens" /></td> }
