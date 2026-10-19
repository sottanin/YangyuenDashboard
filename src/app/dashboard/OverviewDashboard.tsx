'use client'

import { useEffect, useState } from 'react'
import { BarChart } from '@/components/charts/BarChart'
import { Card } from '@/components/ui/Card'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Icon } from '@/components/ui/Icon'
import { KpiTile } from '@/components/ui/KpiTile'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonKpi, SkeletonTable } from '@/components/ui/SkeletonCard'
import { TokenAvatar } from '@/components/ui/TokenAvatar'
import { AddressLink } from '@/components/ui/AddressLink'
import { useWorkspace } from '@/lib/WorkspaceContext'
import { useChartPermissions } from '@/lib/ChartPermissionContext'

interface Metric { value: string; change: number; imageUrl?: string | null; symbol?: string }
interface Row { key: string; txId: string; timestamp: string; fromHash: string; toHash: string; fromName: string | null; toName: string | null; tokenName: string; tokenSymbol: string; standard: string; type: string; value: string; tokenId: string | null; status: string | null; imageUrl: string | null }
interface Report { timezone: string; kpis: { totalTransactions: Metric; dailyGasFee: Metric; totalGasFee: Metric; kap20Distributed: Metric; kap20Redeemed: Metric; redemptionFee: Metric; kap22: Array<Metric & { symbol: string }>; nftMint: Metric; nftBurn: Metric }; monthly: Array<{ label: string; kap20: number; kap22: number; kap721: number }>; transactions: { rows: Row[]; total: number; page: number; totalPages: number } }

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
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { queueMicrotask(() => { setPage(1); setSearchInput(''); setSearch('') }) }, [selected.id])
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim().length >= 2 ? searchInput.trim() : ''); setPage(1) }, 350); return () => window.clearTimeout(timer) }, [searchInput])
  useEffect(() => {
    if (workspaceLoading || selected.id === 'all' || !hasVisibleContent) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setError('') } })
    const query = new URLSearchParams({ workspace: String(selected.id), page: String(page) }); if (search) query.set('search', search)
    fetch(`/api/reports/overview?${query}`, { signal: controller.signal }).then(async (response) => { const body: unknown = await response.json(); if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Unable to load overview'); return body as Report }).then((body) => { if (!controller.signal.aborted) setReport(body) }).catch((reason: unknown) => { if (!controller.signal.aborted) { setReport(null); setError(reason instanceof Error ? reason.message : 'Unable to load overview') } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [hasVisibleContent, page, search, selected.id, workspaceLoading])
  return <div className="min-w-0 max-w-full"><PageHeader title="Overview" subtitle={`Workspace blockchain activity · ${selected.name}`} />
    {!hasVisibleContent ? <section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-default px-6 py-12 text-center"><h2 className="text-base font-semibold text-default">No report content available</h2><p className="mt-2 max-w-md text-sm text-muted">Your role allows access to this menu, but no charts or content are assigned. Contact an administrator if you need access.</p></section> : null}
    {error ? <div className="mb-4"><ErrorCard message={error} /></div> : null}
    {hasVisibleContent && (loading || !report) ? <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <SkeletonKpi key={index} />)}</div> : report ? <>
      {canViewKpis && <section className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canViewTotalTransactions && <KpiTile label="Total Transactions" value={formatAmount(report.kpis.totalTransactions.value)} icon="pulse" />}
        {canViewTotalGasFee && <KpiTile label="Total Gas Fee" value={`${formatKub(report.kpis.totalGasFee.value)} KUB`} valueTrailing={<TokenAvatar src="/assets/tokens/kub.png" symbol="KUB" size="sm" />} icon="zap" />}
        {canViewTokenDistributed && <KpiTile label="Token Distributed" value={`${formatAmount(report.kpis.kap20Distributed.value)} ${report.kpis.kap20Distributed.symbol ?? 'KAP-20'}`} valueTrailing={<TokenAvatar src={report.kpis.kap20Distributed.imageUrl} symbol={report.kpis.kap20Distributed.symbol ?? 'KAP-20'} size="sm" />} icon="users" />}
        {canViewTokenRedeemed && <KpiTile label="Redemption (Burn)" value={`${formatAmount(report.kpis.kap20Redeemed.value)} ${report.kpis.kap20Redeemed.symbol ?? 'KAP-20'}`} valueTrailing={<TokenAvatar src={report.kpis.kap20Redeemed.imageUrl} symbol={report.kpis.kap20Redeemed.symbol ?? 'KAP-20'} size="sm" />} icon="cart" />}
        {canViewRedemptionFee && <KpiTile label="Redemption Fee" value={`${formatAmount(report.kpis.redemptionFee.value)} ${report.kpis.redemptionFee.symbol ?? 'KAP-20'}`} valueTrailing={<TokenAvatar src={report.kpis.redemptionFee.imageUrl} symbol={report.kpis.redemptionFee.symbol ?? 'KAP-20'} size="sm" />} icon="target" />}
        {canViewNftMint && <KpiTile label="NFT Mint" value={`${formatAmount(report.kpis.nftMint.value)} NFTs`} valueTrailing={<TokenAvatar src={report.kpis.nftMint.imageUrl} symbol="NFT" size="sm" />} icon="arrowUp" />}
        {canViewNftBurn && <KpiTile label="NFT Burn" value={`${formatAmount(report.kpis.nftBurn.value)} NFTs`} valueTrailing={<TokenAvatar src={report.kpis.nftBurn.imageUrl} symbol="NFT" size="sm" />} icon="refresh" />}
        {canViewPointTokenDistributed && report.kpis.kap22.map((metric) => <KpiTile key={metric.symbol} label="Point Token Distributed" value={`${formatAmount(metric.value)} ${metric.symbol}`} valueTrailing={<TokenAvatar src={metric.imageUrl} symbol={metric.symbol} size="sm" />} icon="box" />)}
      </section>}
      {canViewMonthly && <Card className="mb-4" title="Monthly Transactions by Token Standard" subtitle="Distinct blockchain transactions per month">{report.monthly.length ? <BarChart data={report.monthly} height={300} tooltipValueFormat="integer" keys={[{ key: 'kap20', label: 'KAP-20 Token', color: 'var(--accent)' }, { key: 'kap22', label: 'KAP-22 Point Token', color: 'var(--accent-3)' }, { key: 'kap721', label: 'KAP-721 NFT', color: 'var(--success)' }]} /> : <div className="flex h-[300px] items-center justify-center text-sm text-muted">No monthly transactions found</div>}</Card>}
      {canViewHistory && <History report={report} page={page} setPage={setPage} searchInput={searchInput} setSearchInput={setSearchInput} />}
    </> : null}
    {hasVisibleContent && !loading && !report && !error ? <SkeletonTable rows={6} /> : null}
  </div>
}

function History({ report, page, setPage, searchInput, setSearchInput }: { report: Report; page: number; setPage: (page: number) => void; searchInput: string; setSearchInput: (value: string) => void }): React.JSX.Element {
  return <Card title="Transaction History" subtitle="Combined KAP-20, KAP-22 and KAP-721 blockchain transactions" noPad><div className="border-b border-default p-5"><div className="relative max-w-xl"><input className="input w-full pr-10" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search TxId, wallet, token or Token ID" aria-label="Search transaction history" /><Icon name="search" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" /></div></div>
    {report.transactions.rows.length === 0 ? <div className="py-16 text-center text-sm text-muted">No transactions found</div> : <div className="overflow-x-auto thin-scroll"><table className="min-w-[1120px] w-full text-sm"><thead><tr className="border-b border-default text-[10.5px] uppercase tracking-wider text-faint">{['Transaction', 'Standard', 'Type', 'From', 'To', 'Token', 'Token ID', 'Amount', 'Date', 'Status'].map((label) => <th key={label} className="px-3 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{report.transactions.rows.map((row) => <tr key={row.key} className="tbl-row border-b border-default last:border-0"><td className="px-3 py-3"><a href={`https://www.kubscan.com/tx/${encodeURIComponent(row.txId)}`} target="_blank" rel="noopener noreferrer" title={row.txId} className="inline-flex items-center gap-1 font-mono text-xs text-default hover:text-accent">{compact(row.txId)}<Icon name="external" size={11} /></a></td><td className="px-3 py-3"><span className="pill pill-accent">{row.standard}</span></td><td className="px-3 py-3"><span className={`pill ${row.type === 'Mint' ? 'pill-success' : row.type === 'Burn' ? 'pill-danger' : 'pill-muted'}`}>{row.type}</span></td><Address address={row.fromHash} name={row.fromName} /><Address address={row.toHash} name={row.toName} /><td className="px-3 py-3 text-xs" title={row.tokenName}><span className="inline-flex items-center gap-2"><TokenAvatar src={row.imageUrl} symbol={row.tokenSymbol || 'NFT'} size="sm" />{row.tokenSymbol || row.tokenName}</span></td><td className="px-3 py-3 font-mono text-xs text-muted">{row.tokenId ?? '—'}</td><td className="px-3 py-3 text-right font-mono text-xs">{formatAmount(row.value)} {row.tokenSymbol}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{new Intl.DateTimeFormat('en-GB', { timeZone: report.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.timestamp))}</td><td className="px-3 py-3"><span className={`pill ${['ok', 'success'].includes((row.status ?? '').toLowerCase()) ? 'pill-success' : 'pill-muted'}`}>{row.status ?? 'Unknown'}</span></td></tr>)}</tbody></table></div>}
    <div className="flex items-center justify-between border-t border-default px-5 py-3 text-xs text-muted"><span>Page {report.transactions.page} of {report.transactions.totalPages} · {report.transactions.total.toLocaleString()} events</span><div className="flex gap-2"><button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn btn-ghost" disabled={page >= report.transactions.totalPages} onClick={() => setPage(page + 1)}>Next</button></div></div></Card>
}
function Address({ address, name }: { address: string; name: string | null }): React.JSX.Element { return <td className="px-3 py-3"><AddressLink address={address} name={name} tab="tokens" /></td> }
