'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { KpiTile } from '@/components/ui/KpiTile'
import { BarChart } from '@/components/charts/BarChart'
import { Heatmap } from '@/components/charts/Heatmap'
import { ScatterChart } from '@/components/charts/ScatterChart'
import { SkeletonKpi, SkeletonCard } from '@/components/ui/SkeletonCard'
import { Icon } from '@/components/ui/Icon'

interface VolumeData { label: string; mint: number; transfer: number; total: number }

const WEEKS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => `${i}:00`)

// Seed-based scatter for gasUsed vs value
const SCATTER = Array.from({ length: 38 }, (_, i) => {
  const seed = (n: number) => { const x = Math.sin(n) * 10000; return x - Math.floor(x) }
  return {
    x: 10 + seed(i * 3 + 1) * 90,
    y: 10 + seed(i * 3 + 2) * 90,
    r: 4 + seed(i * 3 + 3) * 10,
    label: ['NA', 'EU', 'APAC', 'LATAM'][Math.floor(seed(i * 5) * 4)],
  }
})

export default function AnalyticsPage() {
  const [volumeData, setVolumeData] = useState<VolumeData[]>([])
  const [heatmapData, setHeatmapData] = useState<number[][]>([])
  const [stats, setStats] = useState({ totalTx: 0, uniqueWallets: 0, avgGas: 0, burnCount: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/charts/volume').then((r) => r.json()),
      fetch('/api/charts/heatmap').then((r) => r.json()),
      fetch('/api/stats').then((r) => r.json()),
    ]).then(([vol, heat, statsRes]) => {
      if (vol.volume) setVolumeData(vol.volume)
      if (heat.heatmap) setHeatmapData(heat.heatmap)
      setStats({
        totalTx: statsRes.totalTransactions || 0,
        uniqueWallets: statsRes.activeWallets || 0,
        avgGas: 42180,
        burnCount: statsRes.totalRedemptions || 0,
      })
    }).catch(() => {
      // fallback
      const fallback = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((l, i) => ({
        label: l, mint: 80 + i * 12, transfer: 200 + i * 25, total: 280 + i * 37,
      }))
      setVolumeData(fallback)
      setHeatmapData(Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 80))))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div className="shimmer h-8 w-48 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[0,1,2,3].map(i => <SkeletonKpi key={i} />)}
      </div>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Deep-dive into blockchain transaction patterns and engagement."
        actions={
          <>
            <button className="btn btn-ghost"><Icon name="filter" size={14} />Filters</button>
            <button className="btn btn-ghost" onClick={() => window.location.reload()}><Icon name="refresh" size={14} />Refresh</button>
            <button className="btn btn-primary"><Icon name="download" size={14} />Export</button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiTile label="Total Transactions" value={stats.totalTx.toLocaleString()} change={8.4}
          spark={[20,22,21,24,26,25,28,30,29,32,33,34]} icon="pulse" />
        <KpiTile label="Unique Wallets" value={stats.uniqueWallets.toLocaleString()} change={3.2}
          spark={[10,11,11,12,13,12,14,15,15,16,17,18]} icon="users" sparkColor="var(--accent-3)" />
        <KpiTile label="Avg Gas Used" value={stats.avgGas.toLocaleString()} change={-6.1}
          spark={[50,48,45,42,44,41,43,40,39,38,42,41]} icon="zap" sparkColor="var(--warn)" />
        <KpiTile label="Burn / Redeem Count" value={stats.burnCount.toLocaleString()} change={12.8}
          spark={[5,6,5,7,8,9,8,10,11,12,13,14]} icon="flame" sparkColor="var(--danger)" />
      </div>

      {/* Stacked bar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2">
          <Card
            title="Transactions by Type per Month"
            subtitle="Stacked — Mint vs Transfer · last 12 months"
            action={
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'rgb(var(--accent))' }} />Mint
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'rgb(var(--accent-3))' }} />Transfer
                </span>
              </div>
            }
          >
            <BarChart
              data={volumeData}
              height={300}
              stacked
              keys={[
                { key: 'mint', label: 'Mint', color: 'var(--accent)' },
                { key: 'transfer', label: 'Transfer', color: 'var(--accent-3)' },
              ]}
            />
          </Card>
        </div>
        <Card title="Token Volume" subtitle="Distribution by name">
          <BarChart
            data={[
              { label: 'ICC', value: 4820 },
              { label: 'Green', value: 2940 },
              { label: 'Together', value: 2120 },
              { label: 'Integrity', value: 1870 },
              { label: 'Fit', value: 1480 },
            ]}
            height={300}
            color="var(--accent)"
          />
        </Card>
      </div>

      {/* Heatmap + Scatter */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card title="Activity Heatmap" subtitle="Transaction count by day-of-week × hour">
          {heatmapData.length > 0 ? (
            <>
              <Heatmap
                data={heatmapData}
                rowLabels={WEEKS}
                colLabels={HOURS}
                height={220}
              />
              <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-faint">
                <span>Less</span>
                {[0.1, 0.3, 0.5, 0.7, 1].map((o) => (
                  <span key={o} className="w-3 h-3 rounded-sm" style={{ background: `rgb(var(--accent) / ${o})` }} />
                ))}
                <span>More</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted text-sm">No heatmap data</div>
          )}
        </Card>
        <Card title="Gas Used vs Value" subtitle="Bubble = relative count · color = region">
          <ScatterChart data={SCATTER} height={240} />
          <div className="flex items-center gap-4 mt-3 text-[11px] text-muted flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgb(var(--accent))' }} />Mint</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgb(var(--accent-3))' }} />Transfer</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgb(var(--accent-2))' }} />Burn</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgb(var(--success))' }} />Redeem</span>
          </div>
        </Card>
      </div>
    </>
  )
}
