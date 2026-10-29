'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { withExpandableChart } from './ExpandableChart'
import { useResolvedColors } from './useResolvedColors'

export interface TransactionTimelinePoint { label: string; value: number }
export type TransactionTimelineGranularity = 'monthly' | 'daily'
interface TransactionTimelineChartProps {
  monthly: TransactionTimelinePoint[]
  daily: TransactionTimelinePoint[]
  granularity: TransactionTimelineGranularity
  onGranularityChange: (value: TransactionTimelineGranularity) => void
  height?: number
}

function dateLabel(label: string, full: boolean): string {
  const monthly = label.length === 7
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: monthly ? undefined : 'numeric', month: full ? 'long' : 'short', year: monthly || full ? 'numeric' : undefined }).format(new Date(`${label}${monthly ? '-01' : ''}T00:00:00Z`))
}
function amount(value: number): string { return value.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
function visibleLabels(count: number, spacing: number, minimumSpacing: number): Set<number> {
  if (count < 2) return new Set(count ? [0] : [])
  const step = Math.max(1, Math.ceil(minimumSpacing / Math.max(1, spacing)))
  const indices = new Set<number>()
  for (let index = 0; index < count; index += step) {
    if (index === 0 || (count - 1 - index) * spacing >= minimumSpacing) indices.add(index)
  }
  indices.add(count - 1)
  return indices
}

function TransactionTimelinePlot({ monthly, daily, granularity, onGranularityChange, height = 300 }: TransactionTimelineChartProps): React.JSX.Element {
  const data = granularity === 'monthly' ? monthly : daily
  const viewport = useRef<HTMLDivElement>(null)
  const tooltipId = useId()
  const gradientId = `transaction-timeline-area-${useId().replaceAll(':', '')}`
  const [viewportWidth, setViewportWidth] = useState(640)
  const [selection, setSelection] = useState<{ label: string; granularity: TransactionTimelineGranularity } | null>(null)
  const [color] = useResolvedColors(['var(--accent)'])
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const width = Math.max(1, viewportWidth)
  const left = Math.min(width < 480 ? 44 : 58, width / 3), right = Math.min(24, width / 4), top = 38, bottom = 40
  const innerWidth = Math.max(1, width - left - right)
  const spacing = innerWidth / Math.max(1, data.length - 1)
  const valueLabels = visibleLabels(data.length, spacing, 56)
  const axisLabels = visibleLabels(data.length, spacing, width < 480 ? 64 : 76)
  const innerHeight = Math.max(40, height - top - bottom)
  const maximumValue = data.reduce((maximum, point) => Math.max(maximum, point.value), 1)
  const tick = Math.max(1, Math.ceil(maximumValue * 1.12 / 4))
  const maximum = tick * 4
  const x = (index: number): number => data.length <= 1 ? left + innerWidth / 2 : left + index * spacing
  const y = (value: number): number => top + innerHeight - value / maximum * innerHeight
  const selectedIndex = selection?.granularity === granularity ? data.findIndex((point) => point.label === selection.label) : -1
  const point = data[selectedIndex]
  const tooltipWidth = Math.max(1, Math.min(230, width - 16))
  const tooltipX = Math.max(8, Math.min(width - tooltipWidth - 8, x(Math.max(0, selectedIndex)) - tooltipWidth / 2))
  const path = data.map((item, index) => `${index ? 'L' : 'M'}${x(index)},${y(item.value)}`).join(' ')
  const areaPath = data.length > 1 ? `${path} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : ''
  function select(index: number): void {
    const next = data[index]
    if (!next) return
    setSelection({ label: next.label, granularity })
  }
  function pointer(event: PointerEvent<HTMLDivElement>): void {
    if (!data.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - bounds.left
    const py = event.clientY - bounds.top
    if (py < top || py > height - bottom || px < left || px > width - right) { setSelection(null); return }
    const index = data.length <= 1 ? 0 : Math.round((px - left) / innerWidth * (data.length - 1))
    select(Math.max(0, Math.min(data.length - 1, index)))
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') { setSelection(null); return }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1 : Math.max(0, Math.min(data.length - 1, Math.max(0, selectedIndex) + (event.key === 'ArrowRight' ? 1 : -1)))
    select(index)
  }
  return <div className="min-w-0 max-w-full">
    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div role="group" aria-label="รูปแบบช่วงเวลา" className="inline-flex w-fit gap-1 rounded-xl bg-surface-2 p-1">
        {(['monthly', 'daily'] as const).map((mode) => <button key={mode} type="button" aria-pressed={granularity === mode} className={`min-h-11 rounded-lg px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))] ${granularity === mode ? 'bg-[rgb(var(--accent))] text-white' : 'text-muted hover:text-default'}`} onClick={() => { setSelection(null); onGranularityChange(mode) }}>{mode === 'monthly' ? 'รายเดือน' : 'รายวัน'}</button>)}
      </div>
      <span className="text-xs text-muted" aria-live="polite">{granularity === 'monthly' ? 'รายเดือน' : 'รายวัน'} · {data.length.toLocaleString('en-US')} {granularity === 'monthly' ? 'เดือน' : 'วัน'}</span>
    </div>
    {!data.some((item) => item.value > 0) ? <p className="mb-2 text-xs text-muted">ไม่พบธุรกรรมในช่วงเวลานี้</p> : null}
    <div ref={viewport} className="relative w-full max-w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]" role="group" aria-label={`Total Transactions ${granularity === 'monthly' ? 'รายเดือน' : 'รายวัน'} ใช้ลูกศรซ้ายขวาเพื่อดูข้อมูล`} aria-describedby={point ? tooltipId : undefined} tabIndex={0} onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={() => setSelection(null)} onFocus={() => select(0)} onBlur={() => setSelection(null)} onKeyDown={keyboard}>
      <svg width={width} height={height} className="block max-w-full" role="img" aria-label="จำนวนธุรกรรมไม่ซ้ำตามช่วงวันที่เลือก">
        <defs><linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={y(0)}><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {Array.from({ length: 5 }, (_, index) => tick * index).map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="rgb(var(--grid))" strokeDasharray="3 3" /><text x={left - 9} y={y(value) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text-faint))">{amount(value)}</text></g>)}
        {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} pointerEvents="none" /> : null}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => <g key={item.label}>
          {spacing >= 56 || selectedIndex === index || data.length === 1 ? <circle cx={x(index)} cy={y(item.value)} r={selectedIndex === index ? 5 : 3.5} fill={color} /> : null}
          {valueLabels.has(index) ? <text x={x(index)} y={y(item.value) - 12} textAnchor={data.length === 1 ? 'middle' : index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} fontSize="11" fontWeight="600" fill="rgb(var(--text))">{amount(item.value)}</text> : null}
          {axisLabels.has(index) ? <text x={x(index)} y={height - 12} textAnchor={data.length === 1 ? 'middle' : index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} fontSize="10.5" fill="rgb(var(--text-faint))">{dateLabel(item.label, false)}</text> : null}
        </g>)}
        {point ? <g pointerEvents="none"><line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={top + innerHeight} stroke="rgb(var(--text-muted))" strokeDasharray="3 3" /><foreignObject x={tooltipX} y={2} width={tooltipWidth} height={80}><div id={tooltipId} role="status" className="rounded-lg border border-default bg-surface-2 px-3 py-2 text-xs text-default shadow-lg"><div className="font-semibold">{dateLabel(point.label, true)}</div><div className="mt-1">{amount(point.value)} transactions</div></div></foreignObject></g> : null}
      </svg>
    </div>
    <div className="sr-only"><table><caption>Total Transactions {granularity === 'monthly' ? 'รายเดือน' : 'รายวัน'}</caption><thead><tr><th>ช่วงเวลา</th><th>Transactions</th></tr></thead><tbody>{data.map((item) => <tr key={item.label}><th>{dateLabel(item.label, true)}</th><td>{amount(item.value)}</td></tr>)}</tbody></table></div>
  </div>
}

export const TransactionTimelineChart = withExpandableChart(TransactionTimelinePlot, 'Total Transactions')
