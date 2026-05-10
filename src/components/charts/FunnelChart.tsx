'use client'

interface FunnelStep {
  label: string
  value: number
  pct: number
}

interface FunnelChartProps {
  data: FunnelStep[]
}

const FUNNEL_COLORS = [
  'var(--accent)', 'var(--accent-2)', 'var(--accent-3)', 'var(--success)', 'var(--warn)',
]

export function FunnelChart({ data }: FunnelChartProps) {
  const max = data[0]?.value || 1

  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
        const colorNext = FUNNEL_COLORS[(i + 1) % FUNNEL_COLORS.length]
        return (
          <div key={i} className="relative">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: `rgb(var(${color.slice(3)}))` }} />
                <span className="text-sm font-medium text-default">{d.label}</span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-xs text-muted font-mono">{d.value.toLocaleString()}</span>
                <span className="text-xs text-muted">{d.pct}%</span>
              </div>
            </div>
            <div className="h-7 bg-surface-2 rounded-md overflow-hidden relative">
              <div
                className="h-full rounded-md flex items-center justify-end px-2 text-[10px] font-semibold text-white transition-all duration-700"
                style={{
                  width: pct + '%',
                  background: `linear-gradient(90deg, ${color.startsWith('var') ? `rgb(var(${color.slice(3)}))` : color}, ${colorNext.startsWith('var') ? `rgb(var(${colorNext.slice(3)}))` : colorNext})`,
                }}
              >
                {pct > 12 && `${d.pct}%`}
              </div>
            </div>
            {i < data.length - 1 && (
              <div className="absolute -bottom-1 right-2 text-[10px] text-faint">
                ↓ {((data[i + 1].value / d.value) * 100).toFixed(1)}% conv
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
