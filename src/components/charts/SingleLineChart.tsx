'use client'

import { withExpandableChart } from '@/components/charts/ExpandableChart'

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { AverageReferenceTag } from './AverageReferenceTag'
import { datePositions } from '@/lib/reporting/chartTimeline'
import { useResolvedColors } from './useResolvedColors'

export interface SingleLinePoint { label: string; value: number | null; annotations?: string[]; detail?: string }
interface SingleLineChartProps {
  data: SingleLinePoint[]
  label: string
  tooltipUnit: string
  averageUnit?: string
  color?: string
  valueKind?: 'count' | 'amount'
  fractionDigits?: number
  showAverage?: boolean
  averageLabelPrefix?: string
  referenceValue?: number
  referenceLabel?: string
  height?: number
}
function formatValue(value: number, digits: number): string { return value.toLocaleString('en-US', { maximumFractionDigits: digits }) }
function axisDate(label: string): string { return /^\d{4}-\d{2}-\d{2}$/.test(label) ? label.slice(5) : label }

function SingleLineChartPlot({ data, label, tooltipUnit, averageUnit = tooltipUnit, color = 'var(--success)', valueKind = 'amount', fractionDigits, showAverage = true, averageLabelPrefix = 'เฉลี่ย ', referenceValue, referenceLabel = 'ค่าเฉลี่ยจากวันที่มีข้อมูล', height = 300 }: SingleLineChartProps): React.JSX.Element {
  const gradientId = `single-line-area-${useId().replaceAll(':', '')}`
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hovered, setHovered] = useState<number | null>(null)
  const [lineColor, annotationColor] = useResolvedColors([color, 'var(--accent-3)'])
  useEffect(() => { const element = containerRef.current; if (!element) return; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(element); return () => observer.disconnect() }, [])
  const left = 58, right = 24, top = 22, bottom = 38
  const innerWidth = Math.max(1, width - left - right), innerHeight = height - top - bottom
  const values = data.map((point) => point.value !== null && Number.isFinite(point.value) ? point.value : null)
  const measured = values.filter((value): value is number => value !== null)
  const average = referenceValue ?? (measured.reduce((sum, value) => sum + value, 0) / Math.max(1, measured.length))
  const rawMaximum = Math.max(1, ...measured, showAverage ? average : 0)
  const tickStep = valueKind === 'count' ? Math.max(1, Math.ceil(rawMaximum * 1.12 / 4)) : rawMaximum * 1.12 / 4
  const maximum = tickStep * 4
  const positions = datePositions(data.map((point) => point.label))
  const x = (index: number): number => left + (positions[index] ?? 0) * innerWidth
  const y = (value: number): number => top + innerHeight - value / maximum * innerHeight
  const segments: Array<Array<[number, number]>> = []
  let current: Array<[number, number]> = []
  values.forEach((value, index) => {
    const previous = data[index - 1]?.label
    const gap = previous && /^\d{4}-\d{2}-\d{2}$/.test(data[index].label) && /^\d{4}-\d{2}-\d{2}$/.test(previous) && Date.parse(data[index].label) - Date.parse(previous) > 86_400_000
    if (value === null || gap) { if (current.length) segments.push(current); current = [] }
    if (value !== null) current.push([x(index), y(value)])
  })
  if (current.length) segments.push(current)
  const paths = segments.map((segment) => segment.map(([px, py], index) => `${index ? 'L' : 'M'} ${px},${py}`).join(' '))
  const digits = fractionDigits ?? (valueKind === 'count' ? 0 : 2)
  const labelStep = Math.max(1, Math.ceil(data.length / (width < 480 ? 3 : 5)))
  const hoverPoint = hovered === null ? null : data[hovered]
  function pointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!data.length) return
    const bounds = event.currentTarget.getBoundingClientRect(), px = event.clientX - bounds.left, py = event.clientY - bounds.top
    if (px < left || px > width - right || py < top || py > top + innerHeight) { setHovered(null); return }
    let closest = 0
    for (let index = 1; index < data.length; index++) if (Math.abs(x(index) - px) < Math.abs(x(closest) - px)) closest = index
    setHovered(closest)
  }
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lineColor }} />{label}{showAverage && measured.length ? <><span className="ml-2 inline-block w-5 border-t border-dashed border-current" />{referenceLabel}: {formatValue(average, fractionDigits ?? 2)} {averageUnit}</> : null}</div>
    <div ref={containerRef} className="relative w-full max-w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" role="group" aria-label={`กราฟ ${label} ใช้ปุ่มลูกศรซ้ายและขวาเพื่อดูข้อมูลแต่ละวัน`} tabIndex={0} onPointerMove={pointerMove} onPointerLeave={() => setHovered(null)} onBlur={() => setHovered(null)} onFocus={() => { if (data.length) setHovered(0) }} onKeyDown={(event) => {
      if (event.key === 'Escape') { setHovered(null); return }
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setHovered((index) => event.key === 'Home' ? 0 : event.key === 'End' ? Math.max(0, data.length - 1) : Math.max(0, Math.min(data.length - 1, (index ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)))) }
    }}>
      <svg width={width} height={height} className="block max-w-full" role="img" aria-label={`${label}, ${tooltipUnit} ช่องว่างหมายถึงวันที่ยังไม่มีรายงาน`}>
        <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity="0.2" /><stop offset="100%" stopColor={lineColor} stopOpacity="0" /></linearGradient></defs>
        {Array.from({ length: 5 }, (_, index) => tickStep * index).map((value, index) => <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="rgb(var(--grid))" strokeDasharray="3 3" /><text x={left - 9} y={y(value) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text-faint))">{formatValue(value, valueKind === 'count' ? 0 : digits)}</text></g>)}
        {data.map((point, index) => (index % labelStep === 0 && (index === data.length - 1 || data.length - 1 - index > labelStep / 2)) || index === data.length - 1 ? <text key={point.label} x={x(index)} y={height - 10} textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} fontSize="10.5" fill="rgb(var(--text-faint))">{axisDate(point.label)}</text> : null)}
        {segments.map((segment, index) => <g key={index}>{segment.length > 1 ? <><path d={`${paths[index]} L ${segment.at(-1)?.[0]},${y(0)} L ${segment[0][0]},${y(0)} Z`} fill={`url(#${gradientId})`} pointerEvents="none" /><path d={paths[index]} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> : <circle cx={segment[0][0]} cy={segment[0][1]} r="3" fill={lineColor} />}</g>)}
        {data.map((point, index) => point.annotations?.length ? <g key={`annotation-${point.label}`}><line x1={x(index)} x2={x(index)} y1={top + innerHeight - 12} y2={top + innerHeight} stroke={annotationColor} strokeWidth="2" /><circle cx={x(index)} cy={top + innerHeight - 14} r="4.5" fill={annotationColor} /></g> : null)}
        {showAverage && measured.length ? <line pointerEvents="none" x1={left} x2={width - right} y1={y(average)} y2={y(average)} stroke={lineColor} strokeWidth="1.5" strokeDasharray="7 5" /> : null}
        {hovered !== null && hoverPoint ? <g pointerEvents="none"><line x1={x(hovered)} x2={x(hovered)} y1={top} y2={top + innerHeight} stroke="rgb(var(--text-muted))" strokeDasharray="3 3" />{values[hovered] !== null && values[hovered] !== undefined ? <circle cx={x(hovered)} cy={y(values[hovered])} r="4" fill={lineColor} /> : null}</g> : null}
        {showAverage && measured.length ? <AverageReferenceTag text={`${averageLabelPrefix}${formatValue(average, fractionDigits ?? 2)} ${averageUnit}`} left={left} right={width - right} y={y(average)} color={lineColor} /> : null}
      </svg>
      {hoverPoint ? <div className="chart-tooltip !max-w-[calc(100%-1rem)]" style={{ left: `${Math.max(8, Math.min(width - 248, x(hovered ?? 0) - 110))}px`, top: '8px', transform: 'none' }} role="status"><div className="mb-1.5 font-semibold">{hoverPoint.label}</div><p>{hoverPoint.value === null ? 'ยังไม่มีรายงาน' : `${formatValue(hoverPoint.value, digits)} ${tooltipUnit}`}</p>{hoverPoint.detail ? <p className="mt-1 whitespace-normal text-muted">{hoverPoint.detail}</p> : null}{hoverPoint.annotations?.map((annotation, index) => <p key={index} className="mt-1 max-w-64 whitespace-normal border-t border-default pt-1">{annotation}</p>)}</div> : null}
    </div>
    <div className="sr-only"><ul>{data.map((point) => <li key={point.label}>{point.label}: {point.value === null ? 'ยังไม่มีรายงาน' : `${formatValue(point.value, digits)} ${tooltipUnit}`}{point.detail ? `; ${point.detail}` : ''}</li>)}</ul></div>
  </div>
}

export const SingleLineChart = withExpandableChart(SingleLineChartPlot, 'SingleLine chart')
