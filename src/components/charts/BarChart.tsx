'use client'

import { useEffect, useRef, useState } from 'react'
import { fmt } from './chartUtils'
import { useResolvedColors } from './useResolvedColors'

interface BarKey {
  key: string
  label?: string
  color: string
}

interface BarChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[]
  height?: number
  valueKey?: string
  labelKey?: string
  color?: string
  stacked?: boolean
  keys?: BarKey[]
}

export function BarChart({
  data,
  height = 240,
  valueKey = 'value',
  labelKey = 'label',
  color = 'var(--accent)',
  stacked = false,
  keys,
}: BarChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<{ i: number; ki: number } | null>(null)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const padL = 44, padR = 16, padT = 16, padB = 32
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const groupKeys: BarKey[] = keys || [{ key: valueKey, color, label: valueKey }]
  const colorList = useResolvedColors(groupKeys.map((k) => k.color))
  const resolvedGroupKeys = groupKeys.map((k, i) => ({ ...k, _color: colorList[i] }))

  const max = stacked
    ? Math.max(...data.map((d) => groupKeys.reduce((s, k) => s + (Number(d[k.key]) || 0), 0))) * 1.1
    : Math.max(...data.flatMap((d) => groupKeys.map((k) => Number(d[k.key]) || 0))) * 1.1 || 1

  const bandW = innerW / (data.length || 1)
  const groupW = bandW * 0.7
  const barW = stacked ? groupW : groupW / groupKeys.length

  const yScale = (v: number) => padT + innerH - (v / max) * innerH
  const yTicks = 4
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i)

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          {resolvedGroupKeys.map((k, i) => (
            <linearGradient key={i} id={`bar-grad-${i}-${k.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={k._color} stopOpacity="1" />
              <stop offset="100%" stopColor={k._color} stopOpacity="0.6" />
            </linearGradient>
          ))}
        </defs>

        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yScale(v)} y2={yScale(v)}
              stroke="rgb(var(--grid))" strokeDasharray="3 3" opacity={i === 0 ? 0.8 : 0.5} />
            <text x={padL - 8} y={yScale(v) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text-faint))">
              {fmt(v)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = padL + bandW * i + bandW / 2
          const baseY = yScale(0)
          const segs = stacked ? groupKeys.map((k) => ((Number(d[k.key]) || 0) / max) * innerH) : []
          const firstIdx = segs.findIndex((h) => h > 0.5)
          const lastIdx = segs.length - 1 - [...segs].reverse().findIndex((h) => h > 0.5)
          let stackY = baseY

          return (
            <g key={i}>
              {groupKeys.map((k, ki) => {
                const v = Number(d[k.key]) || 0
                const barH = (v / max) * innerH
                if (stacked) {
                  if (barH < 0.5) return null
                  const y = stackY - barH
                  const isTop = ki === lastIdx
                  const isBottom = ki === firstIdx
                  stackY -= barH
                  const x = cx - groupW / 2
                  const w = groupW
                  const r = Math.min(6, barH / 2, w / 2)
                  const tl = isTop ? r : 0
                  const tr = isTop ? r : 0
                  const bl = isBottom ? r : 0
                  const br = isBottom ? r : 0
                  const path = `M${x + tl},${y} L${x + w - tr},${y} ${tr ? `Q${x + w},${y} ${x + w},${y + tr}` : ''} L${x + w},${y + barH - br} ${br ? `Q${x + w},${y + barH} ${x + w - br},${y + barH}` : ''} L${x + bl},${y + barH} ${bl ? `Q${x},${y + barH} ${x},${y + barH - bl}` : ''} L${x},${y + tl} ${tl ? `Q${x},${y} ${x + tl},${y}` : ''} Z`
                  return (
                    <path key={k.key} d={path}
                      fill={`url(#bar-grad-${ki}-${k.key})`}
                      onMouseEnter={() => setHover({ i, ki })}
                      onMouseLeave={() => setHover(null)}
                      style={{ transition: 'opacity 0.2s', opacity: hover && hover.i !== i ? 0.5 : 1 }}
                    />
                  )
                }
                const y = yScale(v)
                const x = cx - groupW / 2 + ki * barW
                return (
                  <rect key={k.key}
                    x={x} y={y}
                    width={barW - 2}
                    height={Math.max(0, barH)}
                    fill={`url(#bar-grad-${ki}-${k.key})`}
                    rx="3"
                    onMouseEnter={() => setHover({ i, ki })}
                    onMouseLeave={() => setHover(null)}
                    style={{ transition: 'opacity 0.2s', opacity: hover && hover.i !== i ? 0.5 : 1 }}
                  />
                )
              })}
              <text x={cx} y={height - 10} textAnchor="middle" fontSize="10.5" fill="rgb(var(--text-faint))">
                {String(d[labelKey] || '')}
              </text>
            </g>
          )
        })}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={{
          left: (padL + bandW * hover.i + bandW / 2) + 'px',
          top: padT + 'px',
        }}>
          <div className="font-semibold mb-1">{String(data[hover.i][labelKey] || '')}</div>
          {resolvedGroupKeys.map((k) => (
            <div key={k.key} className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: k._color }} />
              <span className="text-muted capitalize">{k.label || k.key}:</span>
              <span className="font-mono">{fmt(Number(data[hover!.i][k.key]) || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
