'use client'

import { useEffect, useState } from 'react'
import { KpiTile } from '@/components/ui/KpiTile'
import { SkeletonKpi } from '@/components/ui/SkeletonCard'
import { useWorkspace } from '@/lib/WorkspaceContext'

interface Stats {
  totalTransactions: number
  totalRedemptions: number
  totalWallets: number
  totalGasFee: string
  dailyGasFee: string
}

export function OverviewKpis() {
  const { selected } = useWorkspace()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const wsParam = selected.id === 'all' ? '' : `?workspace=${selected.id}`
    fetch(`/api/stats${wsParam}`)
      .then((r) => r.json())
      .then((data: Stats) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [selected])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[0, 1, 2, 3].map((i) => <SkeletonKpi key={i} />)}
      </div>
    )
  }

  const kpis = [
    {
      label: 'Total Transactions',
      value: (stats?.totalTransactions ?? 0).toLocaleString(),
      change: 8.4,
      spark: [40, 45, 42, 50, 48, 55, 60, 58, 62, 65, 68, 72],
      icon: 'pulse',
      iconBg: 'rgb(99 102 241 / 0.12)',
      sparkColor: 'var(--accent)',
    },
    {
      label: 'Total Gas Fee',
      value: `${stats?.totalGasFee ?? '0.000'} KUB`,
      change: null,
      spark: [20, 22, 24, 23, 25, 26, 28, 27, 29, 30, 31, 32],
      icon: 'zap',
      iconBg: 'rgb(6 182 212 / 0.12)',
      sparkColor: 'var(--accent-3)',
    },
    {
      label: 'Daily Gas Fee',
      value: `${stats?.dailyGasFee ?? '0.000'} KUB`,
      change: null,
      spark: [30, 32, 35, 33, 36, 38, 40, 39, 42, 44, 46, 48],
      icon: 'flame',
      iconBg: 'rgb(139 92 246 / 0.12)',
      sparkColor: 'var(--accent-2)',
    },
    {
      label: 'Total Redemptions',
      value: (stats?.totalRedemptions ?? 0).toLocaleString(),
      change: 12.8,
      spark: [5, 6, 5, 7, 8, 9, 8, 10, 11, 12, 13, 14],
      icon: 'cart',
      iconBg: 'rgb(244 63 94 / 0.12)',
      sparkColor: 'var(--danger)',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      {kpis.map((k, i) => (
        <div key={i} className="animate-in" style={{ animationDelay: `${i * 60}ms` }}>
          <KpiTile {...k} />
        </div>
      ))}
    </div>
  )
}
