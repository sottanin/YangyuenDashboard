'use client'

import { useEffect, useRef, useState } from 'react'
import { useResolvedColors } from './useResolvedColors'

interface ScatterPoint {
  x: number
  y: number
  r: number
  label: string
}

interface ScatterChartProps {
  data: ScatterPoint[]
  height?: number
}

export function ScatterChart({ data, height = 240 }: ScatterChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const [naC, euC, apacC, latC] = useResolvedColors([
    'var(--accent)', 'var(--accent-3)', 'var(--accent-2)', 'var(--success)',
  ])
  const colors: Record<string, string> = { NA: naC, EU: euC, APAC: apacC, LATAM: latC }

  const padL = 36, padR = 16, padT = 12, padB = 28
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
      <svg width={width} height={height}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={padL} x2={width - padR}
              y1={padT + innerH - (v / 100) * innerH}
              y2={padT + innerH - (v / 100) * innerH}
              stroke="rgb(var(--grid))" strokeDasharray="3 3" opacity="0.5"
            />
            <text x={padL - 6} y={padT + innerH - (v / 100) * innerH + 3}
              textAnchor="end" fontSize="10" fill="rgb(var(--text-faint))">
              {v}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <circle key={i}
            cx={padL + (d.x / 100) * innerW}
            cy={padT + innerH - (d.y / 100) * innerH}
            r={d.r}
            fill={colors[d.label] || naC}
            opacity="0.7"
            stroke={colors[d.label] || naC}
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  )
}
