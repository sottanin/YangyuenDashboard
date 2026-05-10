'use client'

import { useResolvedColors } from './useResolvedColors'

interface RadialGaugeProps {
  value: number
  max?: number
  label?: string
  sublabel?: string
  size?: number
  thickness?: number
  color?: string
}

export function RadialGauge({
  value,
  max = 100,
  label,
  sublabel,
  size = 180,
  thickness = 14,
  color = 'var(--accent)',
}: RadialGaugeProps) {
  const [resolvedColor] = useResolvedColors([color])
  const r = size / 2 - thickness / 2 - 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / (max || 1))
  const dash = circ * pct

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--border))" strokeWidth={thickness} opacity="0.4" />
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={resolvedColor} strokeWidth={thickness}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-semibold tracking-tight">
          {value}<span className="text-base text-faint">%</span>
        </div>
        {label && <div className="text-xs text-muted mt-0.5">{label}</div>}
        {sublabel && <div className="text-[10px] text-faint">{sublabel}</div>}
      </div>
    </div>
  )
}
