'use client'

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { fmt, smoothPath } from './chartUtils'
import { useResolvedColors } from './useResolvedColors'

export interface SingleLinePoint {
  label: string
  value: number
  annotations?: string[]
}

interface SingleLineChartProps {
  data: SingleLinePoint[]
  label: string
  tooltipUnit: string
  averageUnit?: string
  color?: string
  valueKind?: 'count' | 'amount'
  height?: number
}

function formatValue(value: number, kind: 'count' | 'amount'): string {
  const safeValue = Number.isFinite(value) ? value : 0
  if (kind === 'count') return Math.round(safeValue).toLocaleString('en-US')
  return safeValue.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function formatAverage(value: number, kind: 'count' | 'amount'): string {
  const safeValue = Number.isFinite(value) ? value : 0
  return safeValue.toLocaleString('en-US', {
    maximumFractionDigits: kind === 'count' ? 2 : 4,
  })
}

export function SingleLineChart({
  data,
  label,
  tooltipUnit,
  averageUnit = tooltipUnit,
  color = 'var(--success)',
  valueKind = 'amount',
  height = 300,
}: SingleLineChartProps) {
  const gradientId = `single-line-area-${useId().replaceAll(':', '')}`
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [tooltipWidth, setTooltipWidth] = useState(220)
  const [hovered, setHovered] = useState<number | null>(null)
  const [lineColor, annotationColor] = useResolvedColors([color, 'var(--accent-3)'])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = tooltipRef.current
    if (!element) return
    const updateWidth = (): void => setTooltipWidth(element.getBoundingClientRect().width)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hovered])

  const left = 54
  const right = 18
  const top = 18
  const bottom = 38
  const innerWidth = Math.max(1, width - left - right)
  const innerHeight = height - top - bottom
  const values = data.map((point) => Number.isFinite(point.value) ? point.value : 0)
  const maximum = Math.max(1, ...values) * 1.12
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  const x = (index: number): number => left + (index / Math.max(1, data.length - 1)) * innerWidth
  const y = (value: number): number => top + innerHeight - (value / maximum) * innerHeight
  const path = smoothPath(values.map((value, index) => [x(index), y(value)]))
  const areaPath = `${path} L ${x(data.length - 1)},${top + innerHeight} L ${x(0)},${top + innerHeight} Z`
  const ticks = Array.from({ length: 5 }, (_, index) => (maximum / 4) * index)
  const labelStep = Math.max(1, Math.ceil(data.length / 5))
  const hoverPoint = hovered === null ? null : data[hovered]
  const tooltipLeft = hovered === null
    ? 8
    : Math.min(Math.max(8, x(hovered) - tooltipWidth / 2), Math.max(8, width - tooltipWidth - 8))

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (data.length === 0) return setHovered(null)
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerX = event.clientX - bounds.left
    const pointerY = event.clientY - bounds.top
    if (pointerX < left || pointerX > width - right || pointerY < top || pointerY > top + innerHeight) {
      setHovered(null)
      return
    }
    const index = Math.round(((pointerX - left) / innerWidth) * Math.max(0, data.length - 1))
    setHovered(Math.min(data.length - 1, Math.max(0, index)))
  }

  return <div>
    <div className="mb-3 flex items-center gap-2 text-xs text-muted" aria-hidden="true">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lineColor }} />
      {label}
      <span className="ml-2 inline-block w-5 border-t border-dashed border-current" />
      Average {formatAverage(average, valueKind)} {averageUnit}
    </div>
    <div
      ref={containerRef}
      className="relative h-[300px] w-full max-w-full overflow-hidden"
      role="img"
      aria-label={`${label} by day`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHovered(null)}
    >
      <svg width={width} height={height} className="block max-w-full" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((value, index) => <g key={index}>
          <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="rgb(var(--grid))" strokeDasharray="3 3" />
          <text x={left - 9} y={y(value) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text-faint))">{fmt(value)}</text>
        </g>)}
        {data.map((point, index) => index % labelStep === 0 || index === data.length - 1 ? <text key={point.label} x={x(index)} y={height - 10} textAnchor="middle" fontSize="10.5" fill="rgb(var(--text-faint))">{point.label.slice(5)}</text> : null)}
        <path d={areaPath} fill={`url(#${gradientId})`} pointerEvents="none" />
        <line x1={left} x2={width - right} y1={y(average)} y2={y(average)} stroke={lineColor} strokeWidth="1.5" strokeDasharray="7 5" opacity="0.8" />
        <text x={width - right} y={Math.max(top + 10, y(average) - 6)} textAnchor="end" fontSize="10.5" fill={lineColor}>Avg {formatAverage(average, valueKind)} {averageUnit}</text>
        <path d={path} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((point, index) => point.annotations?.length ? <g key={`annotation-${point.label}`}>
          <line x1={x(index)} x2={x(index)} y1={top + innerHeight - 12} y2={top + innerHeight} stroke={annotationColor} strokeWidth="2" />
          <circle cx={x(index)} cy={top + innerHeight - 14} r="4.5" fill={annotationColor} stroke="rgb(var(--surface))" strokeWidth="2" />
        </g> : null)}
        {hovered !== null && hoverPoint ? <g pointerEvents="none">
          <line x1={x(hovered)} x2={x(hovered)} y1={top} y2={top + innerHeight} stroke="rgb(var(--text-muted))" strokeDasharray="3 3" />
          <circle cx={x(hovered)} cy={y(values[hovered] ?? 0)} r="4" fill={lineColor} />
        </g> : null}
      </svg>
      {hoverPoint ? <div ref={tooltipRef} className="chart-tooltip" style={{ left: `${tooltipLeft}px`, top: '8px', transform: 'none' }}>
        <div className="mb-1.5 font-semibold">{hoverPoint.label}</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 whitespace-nowrap"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: lineColor }} aria-hidden="true" /><span>Total <span className="font-mono">{formatValue(hoverPoint.value, valueKind)}</span> {tooltipUnit}</span></div>
          {(hoverPoint.annotations ?? []).map((annotation, index) => <div key={`${annotation}-${index}`} className="max-w-72 whitespace-normal border-t border-default pt-1.5 text-muted"><span className="font-medium text-default">Annotations:</span> {annotation}</div>)}
        </div>
      </div> : null}
    </div>
    <div className="sr-only">
      <p>{label} by day.</p>
      <p>Average for the selected period: {formatAverage(average, valueKind)} {tooltipUnit}.</p>
      <ul>{data.map((point) => <li key={point.label}>{point.label}: {formatValue(point.value, valueKind)} {tooltipUnit}.</li>)}</ul>
    </div>
  </div>
}
