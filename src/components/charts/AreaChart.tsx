'use client'

import { useEffect, useRef, useState } from 'react'
import { smoothPath, fmt } from './chartUtils'
import { useResolvedColors } from './useResolvedColors'

interface AreaKey {
  key: string
  label?: string
  color: string
}

interface AreaChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[]
  height?: number
  keys?: AreaKey[]
  showGrid?: boolean
  showAxis?: boolean
  gradientFill?: boolean
}

export function AreaChart({
  data,
  height = 280,
  keys = [{ key: 'value', color: 'var(--accent)' }],
  showGrid = true,
  showAxis = true,
  gradientFill = true,
}: AreaChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<number | null>(null)
  const colorList = useResolvedColors(keys.map((k) => k.color))
  const resolvedKeys = keys.map((k, i) => ({ ...k, _color: colorList[i] }))

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const padL = 44, padR = 16, padT = 16, padB = 32
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const allVals = data.flatMap((d) => keys.map((k) => Number(d[k.key]) || 0))
  const max = Math.max(...allVals) * 1.15
  const min = Math.min(0, ...allVals)

  const xScale = (i: number) => padL + (i / Math.max(1, data.length - 1)) * innerW
  const yScale = (v: number) => padT + innerH - ((v - min) / (max - min || 1)) * innerH

  const yTicks = 4
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => min + ((max - min) / yTicks) * i)

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          {resolvedKeys.map((k, i) => (
            <linearGradient key={k.key} id={`area-grad-${i}-${k.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={k._color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={k._color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {showGrid && tickVals.map((v, i) => (
          <line key={i}
            x1={padL} x2={width - padR}
            y1={yScale(v)} y2={yScale(v)}
            stroke="rgb(var(--grid))" strokeWidth="1" strokeDasharray="3 3"
            opacity={i === 0 ? 0.8 : 0.5}
          />
        ))}

        {showAxis && tickVals.map((v, i) => (
          <text key={i} x={padL - 8} y={yScale(v) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text-faint))">
            {fmt(v)}
          </text>
        ))}

        {showAxis && data.map((d, i) =>
          i % Math.ceil(data.length / 8) === 0 ? (
            <text key={i} x={xScale(i)} y={height - 10} textAnchor="middle" fontSize="10.5" fill="rgb(var(--text-faint))">
              {String(d.label || '')}
            </text>
          ) : null
        )}

        {resolvedKeys.map((k, ki) => {
          const pts: [number, number][] = data.map((d, i) => [xScale(i), yScale(Number(d[k.key]) || 0)])
          const linePath = smoothPath(pts)
          const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${yScale(min)} L ${pts[0][0]},${yScale(min)} Z`
          return (
            <g key={k.key}>
              {gradientFill && <path d={areaPath} fill={`url(#area-grad-${ki}-${k.key})`} />}
              <path d={linePath} fill="none" stroke={k._color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={hover === i ? 4 : 0} fill={k._color} stroke="rgb(var(--surface))" strokeWidth="2" />
              ))}
            </g>
          )
        })}

        {data.map((_, i) => (
          <rect key={i}
            x={xScale(i) - innerW / (data.length * 2)}
            y={padT}
            width={innerW / data.length}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        {hover !== null && (
          <line x1={xScale(hover)} x2={xScale(hover)} y1={padT} y2={padT + innerH}
            stroke="rgb(var(--text-muted))" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        )}
      </svg>

      {hover !== null && (
        <div className="chart-tooltip" style={{ left: xScale(hover) + 'px', top: (padT - 8) + 'px' }}>
          <div className="font-semibold mb-1">{String(data[hover].label || '')}</div>
          {resolvedKeys.map((k) => (
            <div key={k.key} className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: k._color }} />
              <span className="text-muted capitalize">{k.label || k.key}:</span>
              <span className="font-mono">{fmt(Number(data[hover][k.key]) || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
