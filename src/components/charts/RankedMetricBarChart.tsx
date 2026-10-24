'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useResolvedColors } from './useResolvedColors'

export interface RankedMetricPoint { label: string; value: string }

interface Props {
  data: RankedMetricPoint[]
  unit: string
  color: string
  ariaLabel: string
  maximumFractionDigits?: number
}

function RankMarker({ index, y }: { index: number; y: number }): React.JSX.Element {
  if (index > 2) return <text x="0" y={y} fontSize="10.5" fill="rgb(var(--text-faint))">#{index + 1}</text>
  const colorClass = index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-300' : 'text-amber-700'
  return <g transform={`translate(0 ${y - 12})`} className={colorClass} fill="currentColor" aria-label={`Rank ${index + 1}`}>
    <path d="M4 2h10v3.1c0 3.4-2 5.9-5 6.6v2.1h3v2H6v-2h3v-2.1C6 11 4 8.5 4 5.1V2Zm-2 1h2v2.2C4 7.1 3 8.4 1.2 8.8L.5 7.1C1.5 6.8 2 6.2 2 5.2V3Zm12 0h2v2.2c0 1 .5 1.6 1.5 1.9l-.7 1.7C15 8.4 14 7.1 14 5.2V3Z" />
  </g>
}

function formatValue(value: string, maximumFractionDigits: number): string {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits }) : value
}

export function RankedMetricBarChart({ data, unit, color, ariaLabel, maximumFractionDigits = 0 }: Props): React.JSX.Element {
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
  const height = Math.max(280, data.length * 34 + 18)
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
          <title>{point.label}</title>
          <RankMarker index={index} y={y + barHeight / 2 + 4} />
          <text x="25" y={y + barHeight / 2 + 4} fontSize="10.5" fill="rgb(var(--text-muted))">{point.label.length > 19 ? `${point.label.slice(0, 10)}…${point.label.slice(-6)}` : point.label}</text>
          <rect x={left} y={y} width={innerWidth} height={barHeight} rx="5" fill="rgb(var(--grid))" opacity="0.25" />
          <rect x={left} y={y} width={Math.max(2, barWidth)} height={barHeight} rx="5" fill={`url(#${gradientId})`} />
          <text x={width - 4} y={y + barHeight / 2 + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text))">{formatValue(point.value, maximumFractionDigits)} {unit}</text>
        </g>
      })}
    </svg>
    <div className="sr-only"><ol>{data.map((point, index) => <li key={`${index}:${point.label}`}>Rank {index + 1}, {point.label}: {formatValue(point.value, maximumFractionDigits)} {unit}</li>)}</ol></div>
  </div>
}
