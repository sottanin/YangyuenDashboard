'use client'

import { useState } from 'react'

interface DonutSlice {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutSlice[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
}

export function DonutChart({ data, size = 220, thickness = 28, centerLabel, centerValue }: DonutChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const values = data.map((item) => Number.isFinite(item.value) && item.value > 0 ? item.value : 0)
  const total = values.reduce((sum, value) => sum + value, 0)
  const r = size / 2 - 4
  const innerR = Math.max(1, r - Math.max(1, Math.min(thickness, r - 1)))
  const cx = size / 2
  const cy = size / 2
  const hoveredItem = hover === null ? null : data[hover] ?? null

  const arcs = data.map((d, index) => {
    const angle = (values[index] / (total || 1)) * Math.PI * 2
    const precedingValue = values.slice(0, index).reduce((sum, value) => sum + value, 0)
    const startA = -Math.PI / 2 + (precedingValue / (total || 1)) * Math.PI * 2
    const endA = startA + angle
    const large = angle > Math.PI ? 1 : 0
    const x1 = cx + Math.cos(startA) * r
    const y1 = cy + Math.sin(startA) * r
    const x2 = cx + Math.cos(endA) * r
    const y2 = cy + Math.sin(endA) * r
    const x3 = cx + Math.cos(endA) * innerR
    const y3 = cy + Math.sin(endA) * innerR
    const x4 = cx + Math.cos(startA) * innerR
    const y4 = cy + Math.sin(startA) * innerR
    const fullRing = angle >= Math.PI * 2 - Number.EPSILON
      ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} L ${cx} ${cy - innerR} A ${innerR} ${innerR} 0 1 0 ${cx} ${cy + innerR} A ${innerR} ${innerR} 0 1 0 ${cx} ${cy - innerR} Z`
      : null
    return {
      ...d,
      path: values[index] === 0 ? '' : fullRing ?? `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4} Z`,
    }
  })

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {total === 0 && (
            <circle cx={cx} cy={cy} r={(r + innerR) / 2} fill="none" stroke="rgb(148 163 184 / 0.2)" strokeWidth={r - innerR} />
          )}
          {arcs.map((a, i) => (
            <path key={i} d={a.path}
              fill={a.color}
              opacity={hover !== null && hover !== i ? 0.35 : 1}
              style={{ transition: 'opacity 0.2s', cursor: 'pointer' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-xs text-muted">{hoveredItem ? hoveredItem.label : centerLabel}</div>
          <div className="text-2xl font-semibold tracking-tight">
            {hoveredItem ? `${hoveredItem.value}%` : centerValue}
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {data.map((d, i) => (
          <div key={i}
            className="flex items-center gap-3 text-xs cursor-pointer"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ opacity: hover !== null && hover !== i ? 0.5 : 1, transition: 'opacity 0.2s' }}
          >
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="flex-1 text-default truncate">{d.label}</span>
            <span className="font-mono text-muted">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
