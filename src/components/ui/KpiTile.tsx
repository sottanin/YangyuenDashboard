import { Sparkline } from '@/components/charts/Sparkline'
import { Icon } from './Icon'
import { ComparisonTag } from './ComparisonTag'
import type { ReactNode } from 'react'

interface KpiTileProps {
  label: string
  value: string
  change?: number | null
  spark?: number[]
  sparkColor?: string
  icon?: string
  iconBg?: string
  iconColor?: string
  valueTrailing?: ReactNode
  subLabel?: string
  changeLabel?: string
}

export function KpiTile({ label, value, change, spark, sparkColor = 'var(--accent)', icon, iconBg, iconColor, valueTrailing, subLabel, changeLabel }: KpiTileProps) {
  return (
    <div className="glass rounded-2xl p-5 relative overflow-hidden density-card">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-medium text-muted uppercase tracking-wider">{label}</div>
        {icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: iconBg || 'rgb(var(--accent) / 0.12)', color: iconColor || 'rgb(var(--accent))' }}
          >
            <Icon name={icon} size={14} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 items-start gap-2 text-[clamp(1.15rem,1.7vw,1.5rem)] font-semibold leading-snug tracking-tight text-default"><span className="min-w-0 [overflow-wrap:anywhere]" title={value}>{value}</span>{valueTrailing ? <span className="mt-0.5 shrink-0">{valueTrailing}</span> : null}</div>
      {subLabel ? <div className="mt-2 text-xs text-muted">{subLabel}</div> : null}
      {change != null || changeLabel || spark ? <div className="flex flex-wrap items-end justify-between gap-2 mt-3">
        <ComparisonTag change={change} label={changeLabel} />
        {spark && <Sparkline values={spark} color={sparkColor} width={80} height={28} />}
      </div> : null}
    </div>
  )
}
