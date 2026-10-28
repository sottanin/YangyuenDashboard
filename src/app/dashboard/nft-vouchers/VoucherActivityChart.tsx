'use client'

import { withExpandableChart, useExpandedPlotHeight } from '@/components/charts/ExpandableChart'

import { useState } from 'react'
import { NftRank } from '@/components/ui/NftRank'
import { TokenAvatar } from '@/components/ui/TokenAvatar'
export interface VoucherActivityPoint { name: string; purchase: number; redeem: number; tokenAddress: string; tokenId: string; imageUrl: string }
interface VoucherActivityChartProps { data: VoucherActivityPoint[] }
function VoucherActivityChartPlot({ data }: VoucherActivityChartProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? data : data.slice(0, 10)
  const expandedHeight = useExpandedPlotHeight()
  const maximum = Math.max(1, ...data.flatMap((point) => [point.purchase, point.redeem]))
  return <div>
    <p className="mb-4 text-xs text-muted">จำนวนที่ได้รับนับจากวันที่เลือก ส่วนจำนวนที่ใช้แล้วนับจาก voucher ชุดเดียวกันจนถึงข้อมูลล่าสุดที่มี</p>
    <div className="space-y-5" style={expandedHeight ? { minHeight: expandedHeight - 80, display: 'grid', alignContent: 'space-evenly' } : undefined} role="list" aria-label="NFT voucher comparison rankings">{rows.map((point, index) => <div key={point.name} role="listitem" className="grid min-w-0 gap-3 md:grid-cols-[minmax(160px,1fr)_2fr] md:items-center">
      <div className="flex min-w-0 items-center gap-2"><NftRank index={index} /><span className="shrink-0" aria-hidden="true"><TokenAvatar src={point.imageUrl} symbol={point.name.slice(0, 2).toUpperCase()} size="md" className="h-7 w-7 rounded-lg" /></span><span className="min-w-0 break-words text-xs font-medium text-default">{point.name}</span></div>
      <dl className="min-w-0 space-y-2">{[{ label: 'Issued', value: point.purchase, color: 'bg-emerald-500' }, { label: 'Used later', value: point.redeem, color: 'bg-rose-500' }].map((series) => <div key={series.label} className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
        <dt className="text-muted">{series.label}</dt>
        <div className="h-3 min-w-0 rounded bg-surface-2" aria-hidden="true"><div className={`h-full rounded ${series.color}`} style={{ width: `${series.value / maximum * 100}%` }} /></div>
        <dd className="min-w-7 text-right font-mono font-medium text-default">{series.value.toLocaleString()}</dd>
      </div>)}</dl>
    </div>)}</div>
    {data.length > 10 ? <button type="button" className="btn btn-ghost mt-4 min-h-11 focus-visible:ring-2 focus-visible:ring-accent" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show top 10' : `Show all ${data.length} voucher names`}</button> : null}
  </div>
}

export const VoucherActivityChart = withExpandableChart(VoucherActivityChartPlot, 'VoucherActivity chart')
