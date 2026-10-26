'use client'

import Image from 'next/image'
import { createElement, Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Icon } from '@/components/ui/Icon'
import { KpiTile } from '@/components/ui/KpiTile'
import { PeriodFilter } from '@/components/reports/PeriodFilter'
import { ReportScope } from '@/components/reports/ReportScope'
import type { ReportPeriod } from '@/lib/reporting/reportPeriod'
import { PageHeader } from '@/components/ui/PageHeader'
import { useChartPermissions } from '@/lib/ChartPermissionContext'
import { useWorkspace } from '@/lib/WorkspaceContext'
import { VoucherActivityChart, type VoucherActivityPoint } from './VoucherActivityChart'

interface VoucherRow {
  tokenAddress: string
  tokenId: string
  name: string
  ownerHash: string
  detailTH: string | null
  purchaseWallet: string
  purchaseAt: string
  usedAt: string | null
  status: 'Available' | 'Used' | 'Unknown'
  imageUrl: string
}
interface ReportResponse {
  activity: VoucherActivityPoint[]
  rows: VoucherRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  timezone: string
  period: { from: string; to: string }
  inventory: { total: number; available: number; used: number; unknown: number; pairedUsed: number; averageDaysToUse: string | null } | null
  dataThrough: string | null
  error?: string
}

type SafeTag = 'p' | 'div' | 'span' | 'strong' | 'b' | 'em' | 'i' | 'u' | 'ul' | 'ol' | 'li' | 'blockquote' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
const SAFE_TAGS = new Set<SafeTag>(['p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const TAG_CLASSES: Record<SafeTag, string> = {
  p: 'mb-3 last:mb-0', div: 'mb-3 last:mb-0', span: '', strong: 'font-semibold text-default', b: 'font-semibold text-default', em: 'italic', i: 'italic', u: 'underline',
  ul: 'mb-3 list-disc space-y-1 pl-5', ol: 'mb-3 list-decimal space-y-1 pl-5', li: '', blockquote: 'mb-3 border-l-2 border-accent pl-3 text-muted',
  h1: 'mb-3 text-xl font-semibold text-default', h2: 'mb-3 text-lg font-semibold text-default', h3: 'mb-2 text-base font-semibold text-default', h4: 'mb-2 text-sm font-semibold text-default', h5: 'mb-2 text-sm font-medium text-default', h6: 'mb-2 text-xs font-medium uppercase tracking-wide text-default',
}

function compactAddress(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`
}

function formatDate(value: string | null, timezone: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('th-TH', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const MAX_DETAIL_HTML_LENGTH = 200_000
const MAX_DETAIL_HTML_DEPTH = 30

function renderSafeNode(node: Node, key: string, depth = 0): ReactNode {
  if (depth > MAX_DETAIL_HTML_DEPTH) return null
  if (node.nodeType === 3) return node.textContent
  if (node.nodeType !== 1) return null
  const element = node as HTMLElement
  const children = Array.from(element.childNodes).map((child, index) => renderSafeNode(child, `${key}-${index}`, depth + 1))
  const tag = element.tagName.toLowerCase()
  if (tag === 'br') return createElement('br', { key })
  if (tag === 'a') {
    const href = element.getAttribute('href')?.trim() ?? ''
    const safeHref = /^https:\/\//i.test(href) ? href : null
    return safeHref
      ? createElement('a', { key, href: safeHref, target: '_blank', rel: 'noopener noreferrer', className: 'text-accent underline underline-offset-2 hover:text-default' }, children)
      : createElement(Fragment, { key }, children)
  }
  if (['script', 'style', 'iframe', 'object', 'embed', 'form'].includes(tag)) return null
  if (!SAFE_TAGS.has(tag as SafeTag)) return createElement(Fragment, { key }, children)
  const safeTag = tag as SafeTag
  return createElement(safeTag, { key, className: TAG_CLASSES[safeTag] }, children)
}

function SafeHtmlContent({ html }: { html: string }): React.JSX.Element {
  const [content, setContent] = useState<ReactNode>(null)
  const isTruncated = html.length > MAX_DETAIL_HTML_LENGTH
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      const documentValue = new DOMParser().parseFromString(html.slice(0, MAX_DETAIL_HTML_LENGTH), 'text/html')
      setContent(Array.from(documentValue.body.childNodes).map((node, index) => renderSafeNode(node, String(index))))
    })
    return () => { active = false }
  }, [html])
  return <div className="text-sm leading-6 text-muted">{content}{isTruncated ? <p className="mt-3 text-xs text-warning">รายละเอียดถูกตัดให้สั้นลงเพื่อความปลอดภัยในการแสดงผล</p> : null}</div>
}

function VoucherImage({ voucher, className = '' }: { voucher: VoucherRow; className?: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  return <Image
    src={failed ? '/token-default.svg' : voucher.imageUrl}
    alt={`${voucher.name} NFT #${voucher.tokenId}`}
    fill
    unoptimized
    sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
    className={`object-cover ${className}`}
    onError={() => setFailed(true)}
  />
}

function KubscanInstanceLink({ tokenAddress, tokenId }: { tokenAddress: string; tokenId: string }): React.JSX.Element {
  const url = `https://www.kubscan.com/token/${encodeURIComponent(tokenAddress)}/instance/${encodeURIComponent(tokenId)}`
  return <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`Open NFT ${tokenId} on Kubscan`}
    title="View this NFT instance on Kubscan"
    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent/10 text-accent transition hover:bg-accent/20 hover:text-default active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
  ><Icon name="external" size={15} /></a>
}

function VoucherIdentity({ voucher }: { voucher: VoucherRow }): React.JSX.Element {
  return <div className="inline-flex min-w-0 items-center gap-1">
    <span className="font-mono text-xs text-accent">NFT #{voucher.tokenId}</span>
    <KubscanInstanceLink tokenAddress={voucher.tokenAddress} tokenId={voucher.tokenId} />
  </div>
}

function VoucherModal({ voucher, timezone, onClose }: { voucher: VoucherRow; timezone: string; onClose: () => void }): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus() }
  }, [onClose])

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="voucher-detail-title">
    <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close voucher details" onClick={onClose} />
    <div ref={panelRef} className="glass-strong relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-default thin-scroll">
      <button ref={closeRef} type="button" className="btn btn-ghost absolute right-3 top-3 z-10 min-h-11 min-w-11" aria-label="Close voucher details" onClick={onClose}>×</button>
      <div className="grid md:grid-cols-[280px_minmax(0,1fr)]">
        <div className="relative aspect-square min-h-64 overflow-hidden rounded-t-3xl bg-surface md:rounded-l-3xl md:rounded-tr-none"><VoucherImage voucher={voucher} /></div>
        <div className="min-w-0 p-6 md:p-7">
          <div className="mb-4 flex items-start justify-between gap-3 pr-10">
            <div className="min-w-0"><VoucherIdentity voucher={voucher} /><h2 id="voucher-detail-title" className="mt-1 text-xl font-semibold text-default">{voucher.name}</h2></div>
            <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-lg ${voucher.status === 'Available' ? 'border-emerald-300 bg-emerald-500 text-emerald-950' : voucher.status === 'Used' ? 'border-rose-200 bg-rose-400 text-rose-950' : 'border-default bg-surface-2 text-default'}`}>{voucher.status}</span>
          </div>
          <dl className="mb-6 grid gap-3 rounded-2xl border border-default bg-surface/40 p-4 text-xs">
            <div><dt className="text-faint">Purchase</dt><dd className="mt-1 font-mono text-default" title={voucher.purchaseWallet}>{compactAddress(voucher.purchaseWallet)}</dd><dd className="mt-0.5 text-muted">{formatDate(voucher.purchaseAt, timezone)}</dd></div>
            <div><dt className="text-faint">ใช้ล่าสุดที่พบในข้อมูล</dt><dd className="mt-1 text-default">{formatDate(voucher.usedAt, timezone)}</dd></div>
            <div><dt className="text-faint">Owner</dt><dd className="mt-1 break-all font-mono text-default">{voucher.ownerHash}</dd></div>
          </dl>
          <div className="border-t border-default pt-5"><h3 className="mb-3 text-sm font-semibold text-default">Voucher details</h3>{voucher.detailTH?.trim() ? <SafeHtmlContent html={voucher.detailTH} /> : <p className="text-sm text-muted">ไม่มีรายละเอียดเพิ่มเติมสำหรับ NFT Voucher นี้</p>}</div>
        </div>
      </div>
    </div>
  </div>
}

function VoucherCard({ voucher, timezone, onOpen }: { voucher: VoucherRow; timezone: string; onOpen: () => void }): React.JSX.Element {
  return <article className="glass group min-w-0 overflow-hidden rounded-2xl border border-transparent transition hover:-translate-y-0.5 hover:border-accent/40">
    <button type="button" className="relative block aspect-square w-full overflow-hidden bg-surface text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={onOpen} aria-label={`View details for ${voucher.name}, NFT ${voucher.tokenId}`}>
      <VoucherImage voucher={voucher} className="transition duration-300 group-hover:scale-105" />
      <span className={`absolute right-3 top-3 z-20 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-lg ${voucher.status === 'Available' ? 'border-emerald-300 bg-emerald-500 text-emerald-950' : voucher.status === 'Used' ? 'border-rose-200 bg-rose-400 text-rose-950' : 'border-default bg-surface-2 text-default'}`}>{voucher.status}</span>
      <span className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 text-xs font-medium text-white">Click to view details</span>
    </button>
    <div className="space-y-3 p-4">
      <div className="min-w-0"><VoucherIdentity voucher={voucher} /><h3 className="mt-0.5 truncate text-sm font-semibold text-default" title={voucher.name}>{voucher.name}</h3></div>
      <dl className="space-y-2.5 text-xs">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0"><dt className="text-faint">Purchase</dt><dd className="mt-0.5 truncate font-mono text-default" title={voucher.purchaseWallet} aria-label={voucher.purchaseWallet}>{compactAddress(voucher.purchaseWallet)}</dd></div>
          <div className="text-right"><dt className="text-faint">Date</dt><dd className="mt-0.5 whitespace-nowrap text-default"><time dateTime={voucher.purchaseAt}>{formatDate(voucher.purchaseAt, timezone)}</time></dd></div>
        </div>
        <div><dt className="text-faint">ใช้ล่าสุดที่พบในข้อมูล</dt><dd className="mt-0.5 text-default">{formatDate(voucher.usedAt, timezone)}</dd></div>
        <div><dt className="text-faint">Owner</dt><dd className="mt-0.5 truncate font-mono text-default" title={voucher.ownerHash}>{compactAddress(voucher.ownerHash)}</dd></div>
      </dl>
    </div>
  </article>
}

export default function NftVouchersPage(): React.JSX.Element {
  const { selected, loading: workspaceLoading } = useWorkspace()
  const { canViewChart } = useChartPermissions()
  const canViewActivity = canViewChart('nft-vouchers.purchase-redeem')
  const canViewVouchers = canViewChart('nft-vouchers.voucher-list')
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [page, setPage] = useState(1)
  const [period, setPeriod] = useState<ReportPeriod>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [status, setStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 350); return () => window.clearTimeout(timer) }, [searchInput])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherRow | null>(null)
  const closeModal = useCallback((): void => setSelectedVoucher(null), [])

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    if (selected.id === 'all') { setReport(null); setError('Select one workspace to view NFT vouchers.'); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ workspace: String(selected.id), page: String(page), period, status, search }); if (period === 'custom') { params.set('from', customFrom); params.set('to', customTo) }
      const response = await fetch(`/api/reports/nft-vouchers?${params}`, { signal })
      const result = await response.json() as ReportResponse
      if (!response.ok) throw new Error(result.error ?? 'Unable to load NFT vouchers')
      if (signal?.aborted) return
      setReport(result)
      if (page > result.totalPages) setPage(result.totalPages)
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setReport(null); setError(loadError instanceof Error ? loadError.message : 'Unable to load NFT vouchers')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [page, selected.id, period, customFrom, customTo, status, search])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) { setPage(1); setSelectedVoucher(null); setReport(null); setSearchInput(''); setStatus('all') } })
    return () => { active = false }
  }, [selected.id])
  useEffect(() => {
    if (workspaceLoading || (!canViewActivity && !canViewVouchers)) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal) })
    return () => controller.abort()
  }, [canViewActivity, canViewVouchers, load, workspaceLoading])

  if (!canViewActivity && !canViewVouchers) return <><PageHeader title="NFT Vouchers" subtitle="ติดตามการซื้อ การใช้งาน และสถานะปัจจุบันของ NFT Voucher" /><section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-default px-6 py-12 text-center"><h2 className="text-base font-semibold text-default">ยังไม่มีรายงานให้แสดง</h2><p className="mt-2 max-w-md text-sm text-muted">คุณเปิดเมนูนี้ได้ แต่ยังไม่ได้รับสิทธิ์ดูกราฟหรือข้อมูล</p></section></>

  return <div className="min-w-0 max-w-full">
    <PageHeader title="NFT Vouchers" subtitle="ค้นหา voucher รายใบและสถานะล่าสุดของชุดที่ออกในช่วงวันที่เลือก" actions={<PeriodFilter idPrefix="voucher" period={period} customFrom={customFrom} customTo={customTo} maxDate={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())} onPeriodChange={(value) => { setPeriod(value); setPage(1) }} onCustomFromChange={(value) => { setCustomFrom(value); setPage(1) }} onCustomToChange={(value) => { setCustomTo(value); setPage(1) }} />} />
    {report ? <ReportScope from={report.period.from} to={report.period.to} timezone={report.timezone} dataThrough={report.dataThrough} scopeNote="เลือกชุด voucher จากวันที่ได้รับ แล้วดูสถานะล่าสุดของแต่ละใบ หน้านี้แสดงเฉพาะใบที่เปิดให้แสดงและอยู่ในกลุ่มโทเคนที่เปิดใช้งานของ Workspace จึงอาจมียอดต่างจากหน้า NFT Redemptions" /> : null}
    <Card className="mb-4" title="Find vouchers" subtitle="ค้นหาชื่อ voucher ที่อยู่กระเป๋า หรือหมายเลขใบ ผลการค้นหาจะใช้กับทั้งกราฟเปรียบเทียบและรายการด้านล่าง"><div className="grid gap-3 md:grid-cols-[1fr_180px_auto]"><label className="text-xs text-muted">Name, Wallet Address or Token ID<input className="input mt-1 min-h-11" type="search" maxLength={128} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label><label className="text-xs text-muted">Current status<select className="input mt-1 min-h-11" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="all">All statuses</option><option value="Available">Available</option><option value="Used">Used</option><option value="Unknown">Unknown</option></select></label><button type="button" className="btn btn-ghost min-h-11 self-end" onClick={() => { setSearchInput(''); setStatus('all'); setPeriod('all'); setPage(1) }}>Clear filters</button></div></Card>
    {!loading && report?.inventory && canViewVouchers ? <><section className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Filtered voucher inventory"><KpiTile label="Issued instances" subLabel="จำนวน voucher ที่ออกในช่วงวันที่เลือกและตรงกับตัวกรอง" value={report.inventory.total.toLocaleString()} /><KpiTile label="Currently available" subLabel="voucher ในกลุ่มที่เลือกที่ยังไม่พบการใช้และยังอยู่กับผู้ถือ" value={report.inventory.available.toLocaleString()} /><KpiTile label="Currently used" subLabel="voucher ในกลุ่มที่เลือกซึ่งใช้แล้ว ตามสถานะล่าสุด" value={report.inventory.used.toLocaleString()} /><KpiTile label="Ownership unknown" subLabel="voucher ในกลุ่มที่เลือกซึ่งยังระบุสถานะผู้ถือไม่ได้" value={report.inventory.unknown.toLocaleString()} /></section><p className="mb-4 text-xs text-muted">voucher ที่มีข้อมูลรับและใช้ครบ {report.inventory.pairedUsed.toLocaleString()} ใบ · ระยะเวลาเฉลี่ยตั้งแต่ได้รับจนถึงใช้ {report.inventory.averageDaysToUse ?? 'ยังไม่มีข้อมูล'} วัน คำนวณเฉพาะใบที่ใช้แล้วและมีข้อมูลครบ ใบที่เพิ่งได้รับอาจยังมีเวลานำไปใช้น้อยกว่า จึงไม่ควรนำมาสรุปเป็นอัตราการใช้ในระยะเวลาเดียวกัน</p></> : null}
    {error ? <div className="mb-4"><ErrorCard message={error} onRetry={() => void load()} /></div> : null}

    {!error && canViewActivity ? <Card className="mb-4" title="NFT Voucher Comparison · Top 10" subtitle="เปรียบเทียบจำนวนที่ออกในชุดวันที่เลือก และการใช้ที่จับคู่กับ voucher ชุดเดียวกัน">
      {loading ? <div className="h-[360px] shimmer rounded-xl" /> : !report || report.activity.length === 0 ? <div className="flex h-[300px] flex-col items-center justify-center text-center"><Icon name="ticket" size={32} className="mb-3 text-faint" /><p className="text-sm font-medium text-default">ยังไม่พบข้อมูลการรับหรือใช้ voucher</p><p className="mt-1 text-xs text-muted">เมื่อมีการอัปเดตประวัติการรับและใช้ voucher แล้ว ข้อมูลจะแสดงที่นี่</p></div> : <VoucherActivityChart data={report.activity} />}
      {report?.activity.length ? <div className="sr-only"><table><caption>NFT Voucher Activity data</caption><thead><tr><th scope="col">NFT name</th><th scope="col">Purchase</th><th scope="col">Redeem</th></tr></thead><tbody>{report.activity.map((point) => <tr key={point.name}><th scope="row">{point.name}</th><td>{point.purchase}</td><td>{point.redeem}</td></tr>)}</tbody></table></div> : null}
    </Card> : null}

    {!error && canViewVouchers ? <section aria-labelledby="voucher-list-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 id="voucher-list-title" className="text-sm font-semibold text-default">NFT Voucher Cards</h2><p className="mt-0.5 text-xs text-muted">เรียงจากกิจกรรมล่าสุด แสดงสูงสุด 25 รายการต่อหน้า</p></div>{report ? <span className="text-xs text-muted">{report.total.toLocaleString()} vouchers</span> : null}</div>
      {loading ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">{Array.from({ length: 10 }, (_, index) => <div key={index} className="glass overflow-hidden rounded-2xl"><div className="aspect-square shimmer" /><div className="space-y-3 p-4"><div className="h-4 shimmer rounded" /><div className="h-16 shimmer rounded" /></div></div>)}</div> : !report || report.rows.length === 0 ? <div className="glass flex min-h-[260px] flex-col items-center justify-center rounded-2xl text-center"><Icon name="ticket" size={36} className="mb-3 text-faint" /><p className="text-sm font-medium text-default">ไม่พบ voucher</p><p className="mt-1 text-xs text-muted">ไม่พบ voucher ที่ตรงกับเงื่อนไข ล้างตัวกรองเพื่อดูรายการทั้งหมด</p></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">{report.rows.map((voucher) => <VoucherCard key={`${voucher.tokenAddress}:${voucher.tokenId}`} voucher={voucher} timezone={report.timezone} onOpen={() => setSelectedVoucher(voucher)} />)}</div>}
      {report && report.total > 0 ? <nav className="mt-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-default px-4 py-3 text-xs text-muted sm:flex-row sm:items-center" aria-label="NFT voucher pages"><span aria-live="polite">Page {report.page} of {report.totalPages} · {report.total.toLocaleString()} vouchers</span><div className="flex gap-2"><button type="button" className="btn btn-ghost min-h-11" disabled={loading || report.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button type="button" className="btn btn-ghost min-h-11" disabled={loading || report.page >= report.totalPages} onClick={() => setPage((value) => Math.min(report.totalPages, value + 1))}>Next</button></div></nav> : null}
    </section> : null}
    {selectedVoucher && report ? <VoucherModal voucher={selectedVoucher} timezone={report.timezone} onClose={closeModal} /> : null}
  </div>
}
