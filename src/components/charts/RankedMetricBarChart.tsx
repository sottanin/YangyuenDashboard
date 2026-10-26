'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useResolvedColors } from './useResolvedColors'
import { useWorkspace } from '@/lib/WorkspaceContext'
import type { ReportPeriod } from '@/lib/reporting/reportPeriod'

export interface RankedMetricPoint { label: string; value: string; walletAddress?: string; detail?: string }

interface Props {
  data: RankedMetricPoint[]
  unit: string
  color: string
  ariaLabel: string
  maximumFractionDigits?: number
  drilldownPeriod?: ReportPeriod
  drilldownFrom?: string
  drilldownTo?: string
}

function RankMarker({ index, y }: { index: number; y: number }): React.JSX.Element {
  return <text x="0" y={y} fontSize="10.5" fill="rgb(var(--text-faint))">#{index + 1}</text>
}

function formatValue(value: string, maximumFractionDigits: number): string {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits }) : value
}

export function RankedMetricBarChart({ data, unit, color, ariaLabel, maximumFractionDigits = 0, drilldownPeriod = 'all', drilldownFrom, drilldownTo }: Props): React.JSX.Element {
  const { selected } = useWorkspace()
  const href = (address: string): string => { const params = new URLSearchParams({ workspace: String(selected.id), wallet: address, period: drilldownPeriod }); if (drilldownPeriod === 'custom' && drilldownFrom && drilldownTo) { params.set('from', drilldownFrom); params.set('to', drilldownTo) }; return `/dashboard/wallet-activity?${params}` }
  const rootRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hovered, setHovered] = useState<number | null>(null)
  const [barColor] = useResolvedColors([color])
  const gradientId = `ranked-metric-${useId().replaceAll(':', '')}`
  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const height = Math.max(280, data.length * 43 + 18)
  const left = width < 440 ? 118 : 168
  const right = width < 440 ? 96 : 138
  const innerWidth = Math.max(1, width - left - right)
  const values = data.map((point) => Math.max(0, Number(point.value) || 0))
  const maximum = Math.max(1, ...values)
  const rowHeight = (height - 18) / Math.max(1, data.length)
  return <div ref={rootRef} className="relative w-full max-w-full">
    <svg width={width} height={height} className="block max-w-full" role="img" aria-label={ariaLabel}>
      <defs><linearGradient id={gradientId} x1="0" x2="1"><stop offset="0%" stopColor={barColor} stopOpacity="0.5"/><stop offset="100%" stopColor={barColor}/></linearGradient></defs>
      {data.map((point, index) => {
        const y = 8 + index * rowHeight + rowHeight * 0.18
        const barHeight = rowHeight * 0.64
        const barWidth = values[index] / maximum * innerWidth
        return <g key={`${index}:${point.label}`} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} opacity={hovered !== null && hovered !== index ? 0.52 : 1}>
          <title>{point.label}{point.detail ? ` · ${point.detail?.replace(/ reported days$/, ' วันที่มีรายงาน')}` : ''}</title>
          <RankMarker index={index} y={y + barHeight / 2 + 4} />
          <a href={point.walletAddress ? href(point.walletAddress) : undefined} aria-label={point.walletAddress ? `ดูรายการในกระเป๋า for ${point.walletAddress}` : point.label}><text x="25" y={y + barHeight / 2 + 4} fontSize="10.5" fill="rgb(var(--text-muted))">{point.walletAddress ? `${point.walletAddress.slice(0, 8)}…${point.walletAddress.slice(-6)}` : point.label}</text></a>{point.detail ? <text x="25" y={y + barHeight + 12} fontSize="9" fill="rgb(var(--text-faint))">{point.detail?.replace(/ reported days$/, ' วันที่มีรายงาน')}</text> : null}
          <rect x={left} y={y} width={innerWidth} height={barHeight} rx="5" fill="rgb(var(--grid))" opacity="0.25" />
          <rect x={left} y={y} width={Math.max(2, barWidth)} height={barHeight} rx="5" fill={`url(#${gradientId})`} />
          <text x={width - 4} y={y + barHeight / 2 + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text))">{formatValue(point.value, maximumFractionDigits)} {unit}</text>
        </g>
      })}
    </svg>
    <div className="sr-only"><ol>{data.map((point, index) => <li key={`${index}:${point.label}`}>Rank {index + 1}, {point.label}: {formatValue(point.value, maximumFractionDigits)} {unit}</li>)}</ol></div>
  </div>
}
