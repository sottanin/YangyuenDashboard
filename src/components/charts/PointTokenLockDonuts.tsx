'use client'

import { Icon } from '@/components/ui/Icon'
import { TokenAvatar } from '@/components/ui/TokenAvatar'

export interface PointTokenLock {
  id: string
  name: string
  symbol: string
  address: string
  imageUrl: string | null
  active: boolean
  incomingTransfers: string
  outgoingTransfers: string
}

interface PointTokenLockDonutsProps { data: PointTokenLock[]; balanceSymbol: string }

const SEGMENTS = [
  { from: 0, to: 20, color: '#22c55e', label: '0–20%' },
  { from: 20, to: 40, color: '#84cc16', label: '20–40%' },
  { from: 40, to: 60, color: '#eab308', label: '40–60%' },
  { from: 60, to: 80, color: '#f97316', label: '60–80%' },
  { from: 80, to: 100, color: '#ef4444', label: '80–100%' },
] as const

function numericValue(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatAmount(value: string): string {
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return value
  const [, sign, integer, fraction = ''] = match
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const visibleFraction = fraction.slice(0, 4).replace(/0+$/, '')
  return `${sign}${grouped}${visibleFraction ? `.${visibleFraction}` : ''}`
}

function pointForPercentage(percentage: number, radius: number): { x: number; y: number } {
  const angle = Math.PI + (Math.PI * percentage / 100)
  return { x: 100 + radius * Math.cos(angle), y: 100 + radius * Math.sin(angle) }
}

function segmentPath(from: number, to: number): string {
  const start = pointForPercentage(from, 72)
  const end = pointForPercentage(to, 72)
  return `M ${start.x} ${start.y} A 72 72 0 0 1 ${end.x} ${end.y}`
}

function compactAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

export function PointTokenLockDonuts({ data, balanceSymbol }: PointTokenLockDonutsProps): React.JSX.Element {
  if (data.length === 0) return <div className="flex min-h-48 items-center justify-center text-sm text-muted">No Point Token contracts found in this workspace</div>

  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {data.map((token) => {
      const incoming = numericValue(token.incomingTransfers)
      const outgoing = numericValue(token.outgoingTransfers)
      const percentage = incoming > 0 ? (outgoing / incoming) * 100 : 0
      const needle = pointForPercentage(Math.min(100, Math.max(0, percentage)), 56)
      const detailsId = `point-token-performance-${token.id}`
      const accessibleDetails = `${token.name}, ${token.symbol}. Incoming transfers ${token.incomingTransfers} ${balanceSymbol}. Outgoing transfers ${token.outgoingTransfers} ${balanceSymbol}. Performance ${percentage.toFixed(1)} percent.`

      return <article key={token.id} tabIndex={0} aria-describedby={detailsId} title={accessibleDetails} className="rounded-xl border border-default bg-surface/35 p-4 outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30">
        <p id={detailsId} className="sr-only">{accessibleDetails}</p>
        <div className="flex items-center gap-3">
          <TokenAvatar src={token.imageUrl} symbol={token.symbol} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-default">{token.name}</h3>
            <div className="mt-0.5 flex items-center gap-2"><span className="font-mono text-xs text-muted">{token.symbol}</span>{!token.active ? <span className="pill pill-muted text-[9px]">Inactive</span> : null}</div>
          </div>
        </div>

        <div className="mx-auto mt-3 aspect-[2/1.18] w-full max-w-56">
          <svg viewBox="0 0 200 118" className="h-full w-full" role="img" aria-label={`${token.name}: ${percentage.toFixed(1)}% outgoing compared with incoming transfers`}>
            <title>{accessibleDetails}</title>
            {SEGMENTS.map((segment) => <path key={segment.from} d={segmentPath(segment.from, segment.to)} fill="none" stroke={segment.color} strokeWidth="18" opacity="0.92" />)}
            <line x1="100" y1="100" x2={needle.x} y2={needle.y} stroke="rgb(var(--text))" strokeWidth="3" strokeLinecap="round" />
            <circle cx="100" cy="100" r="6" fill="rgb(var(--text))" />
            <text x="100" y="72" textAnchor="middle" fill="rgb(var(--text))" fontSize="17" fontWeight="700">{percentage.toFixed(1)}%</text>
            <text x="100" y="87" textAnchor="middle" fill="rgb(var(--text-muted))" fontSize="8">OUTGOING / INCOMING</text>
            <text x="18" y="114" fill="rgb(var(--text-muted))" fontSize="8">0%</text>
            <text x="170" y="114" fill="rgb(var(--text-muted))" fontSize="8">100%</text>
          </svg>
        </div>

        <div className="mt-1 flex flex-wrap justify-center gap-x-2 gap-y-1" aria-hidden="true">{SEGMENTS.map((segment) => <span key={segment.from} className="inline-flex items-center gap-1 text-[9px] text-muted"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: segment.color }} />{segment.label}</span>)}</div>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3"><dt className="text-muted">Incoming transfers</dt><dd className="font-mono text-default">{formatAmount(token.incomingTransfers)} {balanceSymbol}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted">Outgoing transfers</dt><dd className="font-mono text-default">{formatAmount(token.outgoingTransfers)} {balanceSymbol}</dd></div>
        </dl>

        {incoming === 0 && outgoing > 0 ? <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300" role="status">Outgoing transfers found without matching incoming transfers</p> : null}
        {percentage > 100 ? <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300" role="status">Outgoing transfers exceed incoming transfers</p> : null}
        <a href={`https://www.kubscan.com/address/${encodeURIComponent(token.address)}?tab=tokens`} target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-10 items-center gap-2 rounded-lg border border-default px-3 font-mono text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-accent" title={token.address} aria-label={`Open registered ${token.name} contract ${token.address} on KubScan`}>
          <Icon name="gear" size={14} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{compactAddress(token.address)}</span><Icon name="external" size={12} className="shrink-0" />
        </a>
      </article>
    })}
  </div>
}
