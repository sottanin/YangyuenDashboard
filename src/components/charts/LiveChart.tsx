'use client'

import { useEffect, useRef, useState } from 'react'
import { smoothPath } from './chartUtils'
import { useResolvedColors } from './useResolvedColors'

interface LiveChartProps {
  height?: number
  color?: string
}

export function LiveChart({ height = 180, color = 'var(--accent)' }: LiveChartProps) {
  const [resolved] = useResolvedColors([color])
  const [points, setPoints] = useState<number[]>(() =>
    Array.from({ length: 40 }, (_, i) => 50 + Math.sin(i * 0.4) * 20 + Math.random() * 15)
  )
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setPoints((prev) => {
        const last = prev[prev.length - 1]
        const next = Math.max(20, Math.min(95, last + (Math.random() - 0.5) * 18))
        return [...prev.slice(1), next]
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const padT = 8, padB = 8
  const innerH = height - padT - padB
  const pts: [number, number][] = points.map((v, i) => [
    (i / (points.length - 1)) * width,
    padT + innerH - (v / 100) * innerH,
  ])
  const linePath = smoothPath(pts)
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${height} L ${pts[0][0]},${height} Z`

  return (
    <div ref={wrapRef} className="w-full relative" style={{ height }}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="live-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={resolved} stopOpacity="0.4" />
            <stop offset="100%" stopColor={resolved} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#live-grad)" />
        <path d={linePath} fill="none" stroke={resolved} strokeWidth="2" strokeLinecap="round" />
        {pts.length > 0 && (
          <>
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={resolved} />
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="8" fill={resolved} opacity="0.3">
              <animate attributeName="r" values="4;14;4" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0;0.4" dur="1.6s" repeatCount="indefinite" />
            </circle>
          </>
        )}
      </svg>
      <div className="absolute top-2 right-2 flex items-center gap-2 text-[10px] font-mono">
        <span className="live-dot" />
        <span className="text-muted">LIVE</span>
        <span className="text-default font-semibold">{points[points.length - 1]?.toFixed(1)}%</span>
      </div>
    </div>
  )
}
