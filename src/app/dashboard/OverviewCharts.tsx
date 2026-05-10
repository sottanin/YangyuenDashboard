'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { AreaChart } from '@/components/charts/AreaChart'
import { BarChart } from '@/components/charts/BarChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { RadialGauge } from '@/components/charts/RadialGauge'
import { LiveChart } from '@/components/charts/LiveChart'
import { SkeletonCard } from '@/components/ui/SkeletonCard'

interface VolumeData {
  label: string
  mint: number
  transfer: number
  total: number
}

const TOKEN_COLORS: Record<string, string> = {
  'ICC-YANGYUEN': 'rgb(99 102 241)',
  'Green': 'rgb(6 182 212)',
  'Together': 'rgb(139 92 246)',
  'Integrity': 'rgb(16 185 129)',
  'Fit': 'rgb(245 158 11)',
}

const FUNNEL_DATA = [
  { label: 'Wallets', value: 364, pct: 100 },
  { label: 'Active (transfer)', value: 210, pct: 57.7 },
  { label: 'Multi-token', value: 148, pct: 40.7 },
  { label: 'Redeemers', value: 42, pct: 11.5 },
  { label: 'NFT Holders', value: 18, pct: 4.9 },
]

export function OverviewCharts() {
  const [volumeData, setVolumeData] = useState<VolumeData[]>([])
  const [tokenDist, setTokenDist] = useState<{ label: string; value: number; color: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/charts/volume').then((r) => r.json()),
      fetch('/api/tokens').then((r) => r.json()),
    ]).then(([volRes, tokRes]) => {
      if (volRes.volume) setVolumeData(volRes.volume)
      if (tokRes.tokens) {
        const total = tokRes.tokens.reduce((s: number, t: { transferCount: number }) => s + t.transferCount, 0) || 1
        setTokenDist(
          tokRes.tokens
            .filter((t: { transferCount: number }) => t.transferCount > 0)
            .map((t: { name: string; transferCount: number }) => ({
              label: t.name,
              value: Math.round((t.transferCount / total) * 100),
              color: TOKEN_COLORS[t.name] || 'rgb(var(--accent))',
            }))
        )
      }
    }).catch(() => {
      // use fallback demo data
      setVolumeData([
        { label: 'Jan', mint: 120, transfer: 340, total: 460 },
        { label: 'Feb', mint: 150, transfer: 420, total: 570 },
        { label: 'Mar', mint: 90, transfer: 380, total: 470 },
        { label: 'Apr', mint: 200, transfer: 510, total: 710 },
        { label: 'May', mint: 180, transfer: 480, total: 660 },
        { label: 'Jun', mint: 220, transfer: 560, total: 780 },
      ])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
      <div className="xl:col-span-2"><SkeletonCard height={350} /></div>
      <SkeletonCard height={350} />
    </div>
  )

  return (
    <>
      {/* Main row — area + donut */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2 animate-in" style={{ animationDelay: '240ms' }}>
          <Card
            title="Transaction Volume"
            subtitle="Mint vs Transfer by month"
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
            <AreaChart
              data={volumeData}
              height={300}
              keys={[
                { key: 'mint', label: 'Mint', color: 'var(--accent)' },
                { key: 'transfer', label: 'Transfer', color: 'var(--accent-3)' },
              ]}
            />
          </Card>
        </div>
        <div className="animate-in" style={{ animationDelay: '300ms' }}>
          <Card title="Token Distribution" subtitle="Transfer share by token name">
            {tokenDist.length > 0 ? (
              <DonutChart
                data={tokenDist}
                centerLabel="Tokens"
                centerValue={tokenDist.length.toString()}
                size={180}
                thickness={22}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="text-2xl mb-2">🪙</div>
                <div className="text-sm text-muted">No token data yet</div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="animate-in" style={{ animationDelay: '360ms' }}>
          <Card title="Mint vs Transfer" subtitle="Monthly breakdown">
            <BarChart
              data={volumeData.slice(-6)}
              height={220}
              stacked
              keys={[
                { key: 'mint', label: 'Mint', color: 'var(--accent)' },
                { key: 'transfer', label: 'Transfer', color: 'var(--accent-3)' },
              ]}
            />
          </Card>
        </div>
        <div className="animate-in" style={{ animationDelay: '420ms' }}>
          <Card title="Wallet Activity Funnel" subtitle="Engagement stages">
            <FunnelChart data={FUNNEL_DATA} />
          </Card>
        </div>
        <div className="animate-in" style={{ animationDelay: '480ms' }}>
          <Card title="System Health" subtitle="Network & chain metrics">
            <div className="grid grid-cols-2 gap-2 -mt-2">
              <div className="flex flex-col items-center">
                <RadialGauge value={98} label="Uptime" size={130} thickness={10} color="rgb(16 185 129)" />
              </div>
              <div className="flex flex-col items-center">
                <RadialGauge value={74} label="Chain Sync" size={130} thickness={10} color="rgb(var(--accent))" />
              </div>
              <div className="flex flex-col items-center">
                <RadialGauge value={62} label="API Load" size={130} thickness={10} color="rgb(var(--accent-3))" />
              </div>
              <div className="flex flex-col items-center">
                <RadialGauge value={89} label="Tx Success" size={130} thickness={10} color="rgb(245 158 11)" />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Live chart row */}
      <div className="grid grid-cols-1 mb-4">
        <div className="animate-in" style={{ animationDelay: '540ms' }}>
          <Card title="Live Transaction Signal" subtitle="Real-time activity stream" action={
            <span className="pill pill-success"><span className="live-dot" />Live</span>
          }>
            <LiveChart height={160} />
          </Card>
        </div>
      </div>
    </>
  )
}
