'use client'

import { withExpandableChart } from '@/components/charts/ExpandableChart'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { AverageReferenceTag } from './AverageReferenceTag'
import { fmt, smoothPath } from './chartUtils'
import { useResolvedColors } from './useResolvedColors'

export interface DualLinePoint { label: string; primary: number; secondary: number }
interface Props {
  data: DualLinePoint[]
  primaryLabel: string
  secondaryLabel: string
  height?: number
  primaryAxisLabel?: string
  secondaryAxisLabel?: string
  primaryTooltipUnit?: string
  secondaryTooltipUnit?: string
  primaryColor?: string
  secondaryColor?: string
  primaryFractionDigits?: number
  secondaryFractionDigits?: number
  referenceValue?: number
  referenceLabel?: string
  referenceUnit?: string
}

function DualLineChartPlot({
  data,
  primaryLabel,
  secondaryLabel,
  height = 300,
  primaryAxisLabel = primaryLabel,
  secondaryAxisLabel = secondaryLabel,
  primaryTooltipUnit = primaryLabel,
  secondaryTooltipUnit = secondaryLabel,
  primaryColor: primaryColorValue = 'var(--success)',
  secondaryColor: secondaryColorValue = 'var(--danger)',
  primaryFractionDigits = 0,
  secondaryFractionDigits = 4,
  referenceValue,
  referenceLabel = 'Period average',
  referenceUnit = primaryTooltipUnit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [tooltipWidth, setTooltipWidth] = useState(240)
  const [hovered, setHovered] = useState<number | null>(null)
  const [primaryColor, secondaryColor] = useResolvedColors([primaryColorValue, secondaryColorValue])
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
  const left = 58, right = 68, top = 18, bottom = 38
  const innerWidth = Math.max(1, width - left - right)
  const innerHeight = height - top - bottom
  const primaryMaximum = Math.max(1, referenceValue ?? 0, ...data.map((point) => point.primary)) * 1.12
  const secondaryMaximum = Math.max(1, ...data.map((point) => point.secondary)) * 1.12
  const x = (index: number): number => left + (index / Math.max(1, data.length - 1)) * innerWidth
  const primaryY = (value: number): number => top + innerHeight - (value / primaryMaximum) * innerHeight
  const secondaryY = (value: number): number => top + innerHeight - (value / secondaryMaximum) * innerHeight
  const primaryPath = smoothPath(data.map((point, index) => [x(index), primaryY(point.primary)]))
  const secondaryPath = smoothPath(data.map((point, index) => [x(index), secondaryY(point.secondary)]))
  const primaryTicks = Array.from({ length: 5 }, (_, index) => (primaryMaximum / 4) * index)
  const secondaryTicks = Array.from({ length: 5 }, (_, index) => (secondaryMaximum / 4) * index)
  const desiredLabels = width < 480 ? 4 : width < 720 ? 5 : 7
  const labelStep = Math.max(1, Math.ceil(data.length / desiredLabels))
  const hoverPoint = hovered === null ? null : data[hovered]
  const tooltipLeft = hovered === null
    ? 8
    : Math.min(Math.max(8, x(hovered) - tooltipWidth / 2), Math.max(8, width - tooltipWidth - 8))

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (data.length === 0) {
      setHovered(null)
      return
    }

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

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-5 text-xs text-muted" aria-hidden="true">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />{primaryLabel}</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: secondaryColor }} />{secondaryLabel}</span>
        {referenceValue != null ? <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: primaryColor }} />{referenceLabel}</span> : null}
      </div>
      <div
        ref={containerRef}
        className="relative h-[300px] w-full max-w-full overflow-hidden"
        role="img"
        aria-label={`${primaryLabel} and ${secondaryLabel} by day; left axis ${primaryAxisLabel}, right axis ${secondaryAxisLabel}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <svg width={width} height={height} className="block max-w-full" aria-hidden="true">
          {primaryTicks.map((value, index) => <g key={index}>
            <line x1={left} x2={width - right} y1={primaryY(value)} y2={primaryY(value)} stroke="rgb(var(--grid))" strokeDasharray="3 3" />
            <text x={left - 9} y={primaryY(value) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text-faint))">{fmt(value)}</text>
            <text x={width - right + 9} y={primaryY(value) + 4} textAnchor="start" fontSize="10.5" fill="rgb(var(--text-faint))">{fmt(secondaryTicks[index])}</text>
          </g>)}
          {data.map((point, index) => index % labelStep === 0 || index === data.length - 1 ? <text key={point.label} x={x(index)} y={height - 10} textAnchor="middle" fontSize="10.5" fill="rgb(var(--text-faint))">{point.label.slice(5)}</text> : null)}
          <path d={primaryPath} fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={secondaryPath} fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {referenceValue != null ? <g pointerEvents="none">
            <line x1={left} x2={width - right} y1={primaryY(referenceValue)} y2={primaryY(referenceValue)} stroke={primaryColor} strokeWidth="2" strokeDasharray="7 5" />
          </g> : null}
          {hovered !== null && hoverPoint && <g pointerEvents="none">
            <line x1={x(hovered)} x2={x(hovered)} y1={top} y2={top + innerHeight} stroke="rgb(var(--text-muted))" strokeDasharray="3 3" />
            <circle cx={x(hovered)} cy={primaryY(hoverPoint.primary)} r="4" fill={primaryColor} />
            <circle cx={x(hovered)} cy={secondaryY(hoverPoint.secondary)} r="4" fill={secondaryColor} />
          </g>}
          {referenceValue != null ? <AverageReferenceTag text={`${referenceLabel}: ${referenceValue.toLocaleString('en-US', { maximumFractionDigits: primaryFractionDigits })} ${referenceUnit}`} left={left} right={width - right} y={primaryY(referenceValue)} color={primaryColor} /> : null}
        </svg>
        {hoverPoint && <div
          ref={tooltipRef}
          className="chart-tooltip"
          style={{ left: `${tooltipLeft}px`, top: '8px', transform: 'none' }}
        >
          <div className="mb-1.5 font-semibold">{hoverPoint.label}</div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: primaryColor }} aria-hidden="true" />
            <span><span className="font-mono">{hoverPoint.primary.toLocaleString('en-US', { maximumFractionDigits: primaryFractionDigits })}</span> {primaryTooltipUnit}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 whitespace-nowrap">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: secondaryColor }} aria-hidden="true" />
            <span><span className="font-mono">{hoverPoint.secondary.toLocaleString('en-US', { maximumFractionDigits: secondaryFractionDigits })}</span> {secondaryTooltipUnit}</span>
          </div>
        </div>}
      </div>
      <div className="sr-only">
        <p>{primaryLabel} and {secondaryLabel} by day.</p>
        {referenceValue != null ? <p>{referenceLabel}: {referenceValue.toLocaleString('en-US', { maximumFractionDigits: primaryFractionDigits })} {primaryTooltipUnit}.</p> : null}
        <ul>
          {data.map((point) => (
            <li key={point.label}>
              {point.label}: {primaryLabel} {point.primary}; {secondaryLabel} {point.secondary}.
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export const DualLineChart = withExpandableChart(DualLineChartPlot, 'DualLine chart')
