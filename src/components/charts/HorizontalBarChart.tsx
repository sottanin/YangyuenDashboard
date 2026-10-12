'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useResolvedColors } from './useResolvedColors'

export interface HorizontalBarPoint {
  walletAddress: string
  amount: string
}

interface HorizontalBarChartProps {
  data: HorizontalBarPoint[]
  symbol: string
  color?: string
  ariaLabel: string
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

export function HorizontalBarChart({ data, symbol, color = 'var(--accent)', ariaLabel }: HorizontalBarChartProps): React.JSX.Element {
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
          <text x="0" y={y + barHeight / 2 + 4} fontSize="10.5" fill="rgb(var(--text-faint))">#{index + 1}</text>
          <a href={`https://www.kubscan.com/address/${encodeURIComponent(point.walletAddress)}?tab=token_transfers`} target="_blank" rel="noopener noreferrer" aria-label={`Open wallet ${point.walletAddress} on KubScan`}>
            <text x="24" y={y + barHeight / 2 + 4} fontSize="10.5" fill="rgb(var(--text-muted))" className="hover:fill-[rgb(var(--accent))]">{compactAddress(point.walletAddress)}</text>
          </a>
          <rect x={left} y={y} width={innerWidth} height={barHeight} rx="5" fill="rgb(var(--grid))" opacity="0.28" />
          <rect x={left} y={y} width={Math.max(2, barWidth)} height={barHeight} rx="5" fill={`url(#${gradientId})`} opacity={hovered !== null && hovered !== index ? 0.48 : 1} />
          <text x={width - right + 8} y={y + barHeight / 2 + 4} fontSize="10.5" fill="rgb(var(--text))">{formatExactAmount(point.amount)}</text>
        </g>
      })}
    </svg>
    {hoveredPoint ? <div ref={tooltipRef} className="chart-tooltip" style={{ left: `${tooltipLeft}px`, top: `${tooltipTop}px`, transform: 'none' }}>
      <div className="font-mono text-xs font-semibold">{hoveredPoint.walletAddress}</div>
      <div className="mt-1 flex items-center gap-2 whitespace-nowrap"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: barColor }} aria-hidden="true" /><span><span className="font-mono">{formatExactAmount(hoveredPoint.amount)}</span> {symbol}</span></div>
    </div> : null}
    <div className="sr-only"><ol>{data.map((point) => <li key={point.walletAddress}>{point.walletAddress}: {formatExactAmount(point.amount)} {symbol}</li>)}</ol></div>
  </div>
}
