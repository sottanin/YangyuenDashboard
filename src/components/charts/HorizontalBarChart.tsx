'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useResolvedColors } from './useResolvedColors'
import { Icon } from '@/components/ui/Icon'

export interface HorizontalBarPoint {
  walletAddress: string
  amount: string
}

interface HorizontalBarChartProps {
  data: HorizontalBarPoint[]
  symbol: string
  color?: string
  ariaLabel: string
  rankMarker?: 'trophy' | 'wealth'
}

function compactAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function formatExactAmount(value: string): string {
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return value
  const [, sign, integer, fraction = ''] = match
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const visibleFraction = fraction.replace(/0+$/, '')
  return `${sign}${grouped}${visibleFraction ? `.${visibleFraction}` : ''}`
}

function RankMarker({ index, y, variant }: { index: number; y: number; variant: 'trophy' | 'wealth' }): React.JSX.Element {
  if (index > 2) return <text x="0" y={y} fontSize="10.5" fill="rgb(var(--text-faint))">#{index + 1}</text>
  const colorClass = index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-300' : 'text-amber-700'
  if (variant === 'wealth') return <g transform={`translate(0 ${y - 12})`} className={colorClass} fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-label={`Rank ${index + 1} wealth marker`}>
    <path d="M6 2h6l-1.5 3h-3L6 2Z" fill="currentColor" stroke="none" />
    <path d="M7.5 5h3M7.3 5C4.7 7.1 3.5 9.4 3.5 12c0 3 2.2 4 5.5 4s5.5-1 5.5-4c0-2.6-1.2-4.9-3.8-7" />
    <path d="M10.9 8.7c-.4-.4-1-.6-1.7-.6-1 0-1.7.5-1.7 1.2 0 .8.7 1.1 1.7 1.3 1 .2 1.7.6 1.7 1.4 0 .7-.7 1.3-1.8 1.3-.8 0-1.5-.3-2-.8M9.2 7.3v6.8" />
  </g>
  return <g transform={`translate(0 ${y - 12})`} className={colorClass} fill="currentColor" aria-label={`Rank ${index + 1}`}>
    <path d="M4 2h10v3.1c0 3.4-2 5.9-5 6.6v2.1h3v2H6v-2h3v-2.1C6 11 4 8.5 4 5.1V2Zm-2 1h2v2.2C4 7.1 3 8.4 1.2 8.8L.5 7.1C1.5 6.8 2 6.2 2 5.2V3Zm12 0h2v2.2c0 1 .5 1.6 1.5 1.9l-.7 1.7C15 8.4 14 7.1 14 5.2V3Z" />
  </g>
}

export function HorizontalBarChart({ data, symbol, color = 'var(--accent)', ariaLabel, rankMarker = 'trophy' }: HorizontalBarChartProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hovered, setHovered] = useState<number | null>(null)
  const [tooltipWidth, setTooltipWidth] = useState(260)
  const [barColor] = useResolvedColors([color])
  const gradientId = `horizontal-bar-${useId().replaceAll(':', '')}`

  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = tooltipRef.current
    if (!element) return
    setTooltipWidth(element.getBoundingClientRect().width)
  }, [hovered])

  const height = Math.max(250, data.length * 31 + 26)
  const left = width < 440 ? 112 : 146
  const right = width < 440 ? 62 : 86
  const top = 10
  const rowHeight = (height - top - 10) / Math.max(1, data.length)
  const innerWidth = Math.max(1, width - left - right)
  const numericValues = data.map((point) => {
    const parsed = Number(point.amount)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  })
  const maximum = Math.max(1, ...numericValues)
  const tooltipLeft = hovered === null
    ? 8
    : Math.min(Math.max(8, left + (numericValues[hovered] / maximum) * innerWidth - tooltipWidth / 2), Math.max(8, width - tooltipWidth - 8))
  const tooltipTop = hovered === null ? 8 : Math.max(8, top + hovered * rowHeight - 18)
  const hoveredPoint = hovered === null ? null : data[hovered]

  return <div ref={rootRef} className="relative min-h-[250px] w-full max-w-full">
    <svg width={width} height={height} className="block max-w-full" role="group" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={barColor} stopOpacity="0.58" />
          <stop offset="100%" stopColor={barColor} stopOpacity="1" />
        </linearGradient>
      </defs>
      {data.map((point, index) => {
        const y = top + index * rowHeight + rowHeight * 0.17
        const barHeight = rowHeight * 0.66
        const barWidth = (numericValues[index] / maximum) * innerWidth
        return <g key={point.walletAddress} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)}>
          <RankMarker index={index} y={y + barHeight / 2 + 4} variant={rankMarker} />
          <a href={`https://www.kubscan.com/address/${encodeURIComponent(point.walletAddress)}?tab=tokens`} target="_blank" rel="noopener noreferrer" aria-label={`Open rank ${index + 1} wallet ${point.walletAddress} tokens on KubScan`} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}>
            <g transform={`translate(24 ${y + barHeight / 2 - 6})`} fill="none" stroke="rgb(var(--text-muted))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="4" r="3" /><path d="M1 13v-1c0-2.2 2.2-4 5-4s5 1.8 5 4v1" /></g>
            <text x="40" y={y + barHeight / 2 + 4} fontSize="10.5" fill="rgb(var(--text-muted))" className="hover:fill-[rgb(var(--accent))]">{compactAddress(point.walletAddress)}</text>
          </a>
          <rect x={left} y={y} width={innerWidth} height={barHeight} rx="5" fill="rgb(var(--grid))" opacity="0.28" />
          <rect x={left} y={y} width={Math.max(2, barWidth)} height={barHeight} rx="5" fill={`url(#${gradientId})`} opacity={hovered !== null && hovered !== index ? 0.48 : 1} />
          <text x={width - right + 8} y={y + barHeight / 2 + 4} fontSize="10.5" fill="rgb(var(--text))">{formatExactAmount(point.amount)}</text>
        </g>
      })}
    </svg>
    {hoveredPoint ? <div ref={tooltipRef} className="chart-tooltip" style={{ left: `${tooltipLeft}px`, top: `${tooltipTop}px`, transform: 'none' }}>
      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold"><Icon name="user" size={13} />{hoveredPoint.walletAddress}</div>
      <div className="mt-1 flex items-center gap-2 whitespace-nowrap"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: barColor }} aria-hidden="true" /><span><span className="font-mono">{formatExactAmount(hoveredPoint.amount)}</span> {symbol}</span></div>
    </div> : null}
    <div className="sr-only"><ol>{data.map((point, index) => <li key={point.walletAddress}>Rank {index + 1}, {point.walletAddress}: {formatExactAmount(point.amount)} {symbol}</li>)}</ol></div>
  </div>
}
