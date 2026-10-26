'use client'

import { Icon } from '@/components/ui/Icon'
import { TokenAvatar } from '@/components/ui/TokenAvatar'
import { useResolvedColors } from './useResolvedColors'

export interface PointTokenLock {
  id: string
  name: string
  symbol: string
  address: string
  imageUrl: string | null
  active: boolean
  incomingTransfers: string
  outgoingTransfers: string
  reserve?: string | null
  syncedAt?: string | null
}

interface DecimalParts { value: bigint; scale: number }

function parseDecimal(value: string): DecimalParts | null {
  const match = value.match(/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match) return null
  const exponent = Number(match[4] ?? 0)
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return null
  const fraction = match[3] ?? ''
  const scale = Math.max(0, fraction.length - exponent)
  const digits = `${match[2]}${fraction}${'0'.repeat(Math.max(0, exponent - fraction.length))}`
  return { value: BigInt(`${match[1] === '-' ? '-' : ''}${digits}`), scale }
}

function pairedDecimals(incoming: string, outgoing: string): { incoming: bigint; outgoing: bigint; scale: number } | null {
  const left = parseDecimal(incoming), right = parseDecimal(outgoing)
  if (!left || !right) return null
  const scale = Math.max(left.scale, right.scale)
  return { incoming: left.value * BigInt(10) ** BigInt(scale - left.scale), outgoing: right.value * BigInt(10) ** BigInt(scale - right.scale), scale }
}

function plainDecimal(value: bigint, scale: number): string {
  const sign = value < BigInt(0) ? '-' : ''
  const digits = (value < BigInt(0) ? -value : value).toString().padStart(scale + 1, '0')
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, '') : ''
  return `${sign}${scale ? digits.slice(0, -scale) : digits}${fraction ? `.${fraction}` : ''}`
}

function formatAmount(value: string): string {
  const parsed = parseDecimal(value)
  if (!parsed) return 'ยังไม่มีข้อมูล'
  const [integer, fraction] = plainDecimal(parsed.value, parsed.scale).split('.')
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`
}

export function getOutgoingShare(incoming: string, outgoing: string): number | null {
  const pair = pairedDecimals(incoming, outgoing)
  if (!pair || pair.incoming <= BigInt(0) || pair.outgoing < BigInt(0)) return null
  // Round the ratio after aligning decimal amounts; never round source balances.
  const tenths = (pair.outgoing * BigInt(1000) + pair.incoming / BigInt(2)) / pair.incoming
  const share = Number(tenths) / 10
  return Number.isFinite(share) ? share : null
}

function netRecorded(incoming: string, outgoing: string): string | null {
  const pair = pairedDecimals(incoming, outgoing)
  return pair ? plainDecimal(pair.incoming - pair.outgoing, pair.scale) : null
}

const SEGMENTS = [
  { from: 0, to: 20, color: '#22c55e' },
  { from: 20, to: 40, color: '#84cc16' },
  { from: 40, to: 60, color: '#eab308' },
  { from: 60, to: 80, color: '#f97316' },
  { from: 80, to: 100, color: '#ef4444' },
] as const

function gaugePoint(percentage: number, radius: number): { x: number; y: number } {
  const angle = Math.PI + Math.PI * percentage / 100
  return { x: 100 + radius * Math.cos(angle), y: 104 + radius * Math.sin(angle) }
}

function segmentPath(from: number, to: number): string {
  const start = gaugePoint(from, 78), end = gaugePoint(to, 78)
  return `M ${start.x} ${start.y} A 78 78 0 0 1 ${end.x} ${end.y}`
}

export function PointTokenLockDonuts({ data, balanceSymbol }: { data: PointTokenLock[]; balanceSymbol: string }): React.JSX.Element {
  const [textColor, mutedColor] = useResolvedColors(['var(--text)', 'var(--text-muted)'])
  if (!data.length) return <div className="flex min-h-48 items-center justify-center text-sm text-muted">ยังไม่มี Point Token ในเวิร์กสเปซนี้</div>
  return <div>
    <p className="mb-4 text-xs leading-relaxed text-muted">เกจแสดงสัดส่วนโทเคนที่ส่งออก เทียบกับจำนวนที่รับเข้าทั้งหมดของแต่ละ Point Token สีแสดงช่วงเปอร์เซ็นต์ ส่วนยอดสำรองล่าสุดแสดงแยกไว้ใต้เกจ</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.map((token) => {
      const percentage = getOutgoingShare(token.incomingTransfers, token.outgoingTransfers)
      const needle = gaugePoint(Math.min(100, Math.max(0, percentage ?? 0)), 58)
      const remaining = netRecorded(token.incomingTransfers, token.outgoingTransfers)
      const percentLabel = percentage === null ? '—' : `${percentage.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1, ...(percentage > 9999 ? { notation: 'compact' as const } : {}) })}%`
      const explanation = percentage === null ? 'ยังคำนวณสัดส่วนไม่ได้ เนื่องจากไม่มีข้อมูลยอดรับเข้าที่ใช้คำนวณได้' : `${token.name} ส่งออกคิดเป็น ${percentage.toLocaleString('en-US', { maximumFractionDigits: 1 })}% ของจำนวนที่รับเข้าทั้งหมด`
      return <article key={token.id} className="min-w-0 rounded-xl border border-default p-4">
        <div className="flex items-center gap-3"><TokenAvatar src={token.imageUrl} symbol={token.symbol} size="lg" /><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-default">{token.name}</h3><p className="mt-1 font-mono text-xs text-muted">{token.symbol}{!token.active ? ' · ปิดใช้งาน' : ''}</p></div></div>
        <div className="mx-auto mt-3 w-full max-w-72">
          <svg viewBox="0 0 200 128" className="block h-auto w-full" role="img" aria-label={explanation}>
            <title>{explanation}</title>
            {SEGMENTS.map((segment) => <path key={segment.from} d={segmentPath(segment.from, segment.to)} fill="none" stroke={segment.color} strokeWidth="20" opacity={percentage === null ? 0.25 : 1} />)}
            <text x="100" y="73" textAnchor="middle" fill={textColor} fontSize="20" fontWeight="700">{percentLabel}</text>
            <text x="100" y="88" textAnchor="middle" fill={mutedColor} fontSize="8.5">ส่งออกเทียบกับรับเข้า</text>
            {percentage !== null ? <g><line x1="100" y1="104" x2={needle.x} y2={needle.y} stroke={textColor} strokeWidth="3" strokeLinecap="round" /><circle cx="100" cy="104" r="6" fill={textColor} /></g> : null}
            <text x="16" y="125" fill={mutedColor} fontSize="9">0%</text><text x="163" y="125" fill={mutedColor} fontSize="9">100%</text>
          </svg>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-2 gap-y-1 text-[10px] text-muted" aria-label="ช่วงเปอร์เซ็นต์ของเกจ">{SEGMENTS.map((segment) => <span key={segment.from} className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" />{segment.from}–{segment.to}%</span>)}</div>
        {percentage === null ? <p className="mt-3 text-xs text-muted">ยังไม่มีข้อมูลรับเข้าที่ใช้คำนวณสัดส่วนได้</p> : percentage > 100 ? <p className="mt-3 text-xs text-muted">ยอดส่งออกมากกว่ายอดรับเข้าที่มีข้อมูล เข็มจึงแสดงที่ขีดสูงสุด 100% โดยเปอร์เซ็นต์ด้านบนแสดงค่าที่คำนวณได้จริง</p> : null}
        <div className="mt-4 border-t border-default pt-4"><p className="text-xs text-muted">ยอดสำรองล่าสุด</p><p className="mt-1 break-all font-mono text-xl font-semibold text-default">{token.reserve == null ? 'ยังไม่มีข้อมูล' : `${formatAmount(token.reserve)} ${balanceSymbol}`}</p><p className="mt-2 text-[11px] leading-relaxed text-muted">{token.reserve == null ? 'ยังไม่พบยอดสำรองล่าสุด ยอดรับเข้าและส่งออกด้านล่างเป็นยอดสะสม ไม่ใช่ยอดคงเหลือปัจจุบัน' : token.syncedAt ? `ข้อมูล ณ ${new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(token.syncedAt))}` : 'ยังไม่มีเวลาที่อัปเดตยอดนี้'}</p></div>
        <dl className="mt-4 space-y-3 border-t border-default pt-4 text-xs">{[{ label: 'รับเข้าสะสม', value: token.incomingTransfers }, { label: 'ส่งออกสะสม', value: token.outgoingTransfers }, { label: 'ส่วนต่างรับเข้าและส่งออก', value: remaining }].map((item) => <div key={item.label}><dt className="text-muted">{item.label}</dt><dd className="mt-1 break-all font-mono text-default">{item.value === null ? 'ยังไม่มีข้อมูล' : `${formatAmount(item.value)} ${balanceSymbol}`}</dd></div>)}</dl>
        <a href={`https://www.kubscan.com/address/${encodeURIComponent(token.address)}?tab=tokens`} target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-11 items-center gap-2 rounded-lg border border-default px-3 text-xs text-muted hover:text-accent focus-visible:ring-2 focus-visible:ring-accent" title={token.address} aria-label={`ดูรายละเอียด ${token.name} บน KubScan`}><Icon name="external" size={12} /><span className="break-all">{token.address.slice(0, 8)}…{token.address.slice(-6)}</span></a>
      </article>
    })}</div>
  </div>
}
