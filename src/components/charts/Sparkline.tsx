'use client'

import { useId } from 'react'
import { smoothPath } from './chartUtils'
import { useResolvedColors } from './useResolvedColors'

interface SparklineProps {
  values: number[]
  color?: string
  width?: number
  height?: number
  fill?: boolean
}

export function Sparkline({ values, color = 'var(--accent)', width = 100, height = 32, fill = true }: SparklineProps) {
  const [resolved] = useResolvedColors([color])
  const id = useId()
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const pts: [number, number][] = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - ((v - min) / range) * (height - 4) - 2,
  ])
  const linePath = smoothPath(pts)
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${height} L ${pts[0][0]},${height} Z`

  return (
    <svg width={width} height={height} className="block">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={resolved} stopOpacity="0.3" />
          <stop offset="100%" stopColor={resolved} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={areaPath} fill={`url(#${id})`} />}
      <path d={linePath} fill="none" stroke={resolved} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
