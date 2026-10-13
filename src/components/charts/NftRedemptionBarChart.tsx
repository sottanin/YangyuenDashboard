'use client'

import { Icon } from '@/components/ui/Icon'
import { TokenAvatar } from '@/components/ui/TokenAvatar'

export interface NftRedemptionBarPoint {
  name: string
  imageUrl: string | null
  total: number
}

interface Props {
  data: NftRedemptionBarPoint[]
  variant?: 'redemption' | 'burn'
}

function Rank({ index }: { index: number }): React.JSX.Element {
  if (index > 2) return <span className="w-7 text-center text-xs text-faint">#{index + 1}</span>
  const color = index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-300' : 'text-amber-700'
  return <span className={`flex w-7 justify-center ${color}`} aria-label={`Rank ${index + 1}`}><Icon name="target" size={17} /></span>
}

export function NftRedemptionBarChart({ data, variant = 'redemption' }: Props): React.JSX.Element {
  const maximum = Math.max(1, ...data.map((point) => point.total))
  const barColor = variant === 'burn' ? '#f97316' : 'rgb(var(--accent))'
  const trackColor = variant === 'burn' ? 'rgb(249 115 22 / 0.12)' : 'rgb(var(--accent) / 0.12)'
  return <div className="space-y-3" role="list" aria-label={variant === 'burn' ? 'Top 10 NFT burns' : 'Top 10 NFT redemptions'}>
    {data.map((point, index) => <div key={`${point.name}-${index}`} className="grid grid-cols-[28px_minmax(110px,180px)_minmax(120px,1fr)_52px] items-center gap-3" role="listitem">
      <Rank index={index} />
      <div className="flex min-w-0 items-center gap-2">
        <TokenAvatar src={point.imageUrl} symbol={point.name.slice(0, 2).toUpperCase()} size="md" className="h-7 w-7 rounded-lg" />
        <span className="truncate rounded text-xs font-medium text-default focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" title={point.name} aria-label={point.name} tabIndex={0}>{point.name}</span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full"
        style={{ background: trackColor }}
        role="progressbar"
        aria-label={`${point.name}: ${point.total} ${variant === 'burn' ? 'burns' : 'redemptions'}`}
        aria-valuemin={0}
        aria-valuemax={maximum}
        aria-valuenow={point.total}
      >
        <div className="h-full rounded-full" style={{ width: `${(point.total / maximum) * 100}%`, background: barColor }} />
      </div>
      <span className="text-right font-mono text-xs font-semibold text-default">{point.total.toLocaleString()}</span>
    </div>)}
  </div>
}
