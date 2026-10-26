'use client'

import { useState } from 'react'
export interface VoucherActivityPoint { name: string; purchase: number; redeem: number; tokenAddress: string; tokenId: string; imageUrl: string }
interface VoucherActivityChartProps { data: VoucherActivityPoint[] }
export function VoucherActivityChart({ data }: VoucherActivityChartProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? data : data.slice(0, 10)
  const maximum = Math.max(1, ...data.flatMap((point) => [point.purchase, point.redeem]))
  return <div>
    <p className="mb-4 text-xs text-muted">จำนวนที่ได้รับนับจากวันที่เลือก ส่วนจำนวนที่ใช้แล้วนับจาก voucher ชุดเดียวกันจนถึงข้อมูลล่าสุดที่มี</p>
    <div className="space-y-5">{rows.map((point) => <div key={point.name} className="grid min-w-0 gap-3 md:grid-cols-[minmax(160px,1fr)_2fr] md:items-center">
      <div className="break-words text-xs font-medium text-default">{point.name}</div>
      <dl className="min-w-0 space-y-2">{[{ label: 'Issued', value: point.purchase, color: 'bg-emerald-500' }, { label: 'Used later', value: point.redeem, color: 'bg-rose-500' }].map((series) => <div key={series.label} className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
        <dt className="text-muted">{series.label}</dt>
        <div className="h-3 min-w-0 rounded bg-surface-2" aria-hidden="true"><div className={`h-full rounded ${series.color}`} style={{ width: `${series.value / maximum * 100}%` }} /></div>
        <dd className="min-w-7 text-right font-mono font-medium text-default">{series.value.toLocaleString()}</dd>
      </div>)}</dl>
    </div>)}</div>
    {data.length > 10 ? <button type="button" className="btn btn-ghost mt-4 min-h-11 focus-visible:ring-2 focus-visible:ring-accent" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show top 10' : `Show all ${data.length} voucher names`}</button> : null}
  </div>
}
