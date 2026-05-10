'use client'

import { useState } from 'react'

interface HeatmapProps {
  data: number[][]
  rowLabels: string[]
  colLabels: string[]
  height?: number
}

export function Heatmap({ data, rowLabels, colLabels, height = 220 }: HeatmapProps) {
  const [hover, setHover] = useState<{ ri: number; ci: number; v: number } | null>(null)

  return (
    <div className="relative w-full" style={{ height }}>
      <div className="flex h-full">
        <div className="flex flex-col justify-around pr-2 text-[10px] text-faint pt-3 pb-5">
          {rowLabels.map((l) => <div key={l}>{l}</div>)}
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 grid gap-[3px]" style={{ gridTemplateRows: `repeat(${data.length}, 1fr)` }}>
            {data.map((row, ri) => (
              <div key={ri} className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}>
                {row.map((v, ci) => (
                  <div key={ci}
                    className="heatmap-cell"
                    style={{ background: `rgb(var(--accent) / ${0.08 + (v / 100) * 0.92})` }}
                    onMouseEnter={() => setHover({ ri, ci, v })}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-faint mt-1">
            {colLabels.filter((_, i) => i % 4 === 0).map((l) => <span key={l}>{l}</span>)}
          </div>
        </div>
      </div>
      {hover && (
        <div className="absolute top-2 right-2 chart-tooltip" style={{ position: 'absolute', transform: 'none' }}>
          {rowLabels[hover.ri]} · {colLabels[hover.ci]} → <span className="font-mono">{hover.v}</span>
        </div>
      )}
    </div>
  )
}
