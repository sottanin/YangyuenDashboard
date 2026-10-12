import { Sparkline } from '@/components/charts/Sparkline'
import { Icon } from './Icon'
import type { ReactNode } from 'react'

interface KpiTileProps {
  label: string
  value: string
  change?: number | null
  spark?: number[]
  sparkColor?: string
  icon?: string
  iconBg?: string
  valueTrailing?: ReactNode
}

export function KpiTile({ label, value, change, spark, sparkColor = 'var(--accent)', icon, iconBg, valueTrailing }: KpiTileProps) {
  const positive = (change ?? 0) >= 0
  return (
    <div className="glass rounded-2xl p-5 relative overflow-hidden density-card">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-medium text-muted uppercase tracking-wider">{label}</div>
        {icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: iconBg || 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }}
          >
            <Icon name={icon} size={14} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight text-default"><span className="min-w-0 truncate">{value}</span>{valueTrailing}</div>
      <div className="flex items-end justify-between mt-3">
        {change != null ? (
          <div className={`pill ${positive ? 'pill-success' : 'pill-danger'}`}>
            <Icon name={positive ? 'arrowUp' : 'arrowDown'} size={10} strokeWidth={2.5} />
            {Math.abs(change)}%
          </div>
        ) : (
          <div />
        )}
        {spark && <Sparkline values={spark} color={sparkColor} width={80} height={28} />}
      </div>
    </div>
  )
}
