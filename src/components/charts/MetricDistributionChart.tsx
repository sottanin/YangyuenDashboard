'use client'

import { useResolvedColors } from './useResolvedColors'

export interface MetricDistributionPoint { label: string; count: number }

interface Props {
  data: MetricDistributionPoint[]
  color: string
  ariaLabel: string
}

export function MetricDistributionChart({ data, color, ariaLabel }: Props): React.JSX.Element {
  const [barColor] = useResolvedColors([color])
  const maximum = Math.max(1, ...data.map((point) => point.count))
  return <div className="space-y-4" role="img" aria-label={ariaLabel}>
    {data.map((point) => <div key={point.label}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="text-muted">{point.label}</span><span className="shrink-0 font-mono font-semibold text-default">{point.count.toLocaleString()} users</span></div>
      <div className="h-7 overflow-hidden rounded-lg bg-[rgb(var(--grid)/.2)]"><div className="h-full min-w-[2px] rounded-lg transition-[width] duration-500" style={{ width: `${point.count === 0 ? 0 : Math.max(1.5, point.count / maximum * 100)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${barColor} 52%, transparent), ${barColor})` }} /></div>
    </div>)}
    <div className="sr-only"><ul>{data.map((point) => <li key={point.label}>{point.label}: {point.count.toLocaleString()} users</li>)}</ul></div>
  </div>
}
