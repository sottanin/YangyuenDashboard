'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { KpiTile } from '@/components/ui/KpiTile'
import { BarChart } from '@/components/charts/BarChart'
import { SkeletonKpi, SkeletonCard } from '@/components/ui/SkeletonCard'
import { Icon } from '@/components/ui/Icon'

interface WalletRow {
  id: string
  walletId: string
  balanceICC: string
  balanceGreen: string
  balanceTogether: string
  balanceIntegrity: string
  balanceFit: string
}

function trunc(s: string) {
  if (!s || s.length <= 16) return s
  return s.slice(0, 8) + '...' + s.slice(-6)
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchWallets = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/wallets?page=${p}&limit=20`)
      const data = await res.json()
      setWallets(data.wallets || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch {
      setWallets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWallets(page)
  }, [page, fetchWallets])

  // Compute KPI values from wallets data
  const topICC = wallets.length > 0 ? Math.max(...wallets.map(w => parseFloat(w.balanceICC))) : 0
  const topGreen = wallets.length > 0 ? Math.max(...wallets.map(w => parseFloat(w.balanceGreen))) : 0
  const avgTotal = wallets.length > 0
    ? wallets.reduce((s, w) =>
        s + parseFloat(w.balanceICC) + parseFloat(w.balanceGreen) + parseFloat(w.balanceTogether) + parseFloat(w.balanceIntegrity) + parseFloat(w.balanceFit), 0
      ) / wallets.length
    : 0

  // Distribution chart data (mock buckets)
  const ICC_BUCKETS = [
    { label: '0', value: 0 },
    { label: '1–100', value: 0 },
    { label: '101–500', value: 0 },
    { label: '501–2K', value: 0 },
    { label: '2K+', value: 0 },
  ]
  wallets.forEach(w => {
    const v = parseFloat(w.balanceICC)
    if (v === 0) ICC_BUCKETS[0].value++
    else if (v <= 100) ICC_BUCKETS[1].value++
    else if (v <= 500) ICC_BUCKETS[2].value++
    else if (v <= 2000) ICC_BUCKETS[3].value++
    else ICC_BUCKETS[4].value++
  })

  return (
    <>
      <PageHeader
        title="Wallets"
        subtitle={`${total.toLocaleString()} registered wallets with token balances`}
        actions={
          <button className="btn btn-ghost" onClick={() => fetchWallets(page)}>
            <Icon name="refresh" size={14} />Refresh
          </button>
        }
      />

      {loading && !wallets.length ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {[0,1,2,3].map(i => <SkeletonKpi key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiTile label="Total Wallets" value={total.toLocaleString()} change={4.8}
            spark={[40,42,45,46,48,50,52,54,56,58,60,62]} icon="users" />
          <KpiTile label="Top ICC Balance" value={topICC.toFixed(0)} change={12.4}
            spark={[20,22,24,26,25,28,30,32,34,36,38,40]} icon="pulse" sparkColor="var(--success)" />
          <KpiTile label="Top Green Balance" value={topGreen.toFixed(0)} change={2.1}
            spark={[30,31,32,31,32,33,34,33,34,34,34,34]} icon="box" sparkColor="var(--accent-3)" />
          <KpiTile label="Avg Total Balance" value={avgTotal.toFixed(0)} change={-0.4}
            spark={[2.5,2.4,2.4,2.3,2.3,2.2,2.2,2.2,2.1,2.1,2.1,2.1]} icon="activity" sparkColor="var(--accent-2)" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2">
          <Card title="ICC-YANGYUEN Balance Distribution" subtitle="Wallets bucketed by balance range">
            {loading ? <SkeletonCard height={260} /> : (
              <BarChart
                data={ICC_BUCKETS}
                height={240}
                color="var(--accent)"
              />
            )}
          </Card>
        </div>
        <Card title="Token Summary" subtitle="Across all wallets">
          <div className="space-y-3 mt-1">
            {['ICC-YANGYUEN', 'Green', 'Together', 'Integrity', 'Fit'].map((name, i) => {
              const keys = ['balanceICC', 'balanceGreen', 'balanceTogether', 'balanceIntegrity', 'balanceFit'] as const
              const key = keys[i]
              const sum = wallets.reduce((s, w) => s + parseFloat(w[key]), 0)
              const max = wallets.length > 0 ? Math.max(...wallets.map(w => parseFloat(w[key]))) : 1
              const pct = max > 0 ? Math.min(100, (sum / (max * wallets.length)) * 100) : 0
              const colors = ['rgb(99 102 241)', 'rgb(6 182 212)', 'rgb(139 92 246)', 'rgb(16 185 129)', 'rgb(245 158 11)']
              return (
                <div key={name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-default">{name}</span>
                    <span className="font-mono text-muted">{sum.toFixed(0)}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${pct}%`, background: colors[i] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <Card title="All Wallets" subtitle="Sorted by ICC-YANGYUEN balance (desc)" noPad>
        {loading ? (
          <div className="p-5 space-y-3">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="flex gap-3">
                <div className="shimmer w-32 h-4 rounded" />
                <div className="shimmer flex-1 h-4 rounded" />
                <div className="shimmer w-16 h-4 rounded" />
              </div>
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">👛</div>
            <div className="text-sm font-medium text-default">No wallets found</div>
            <div className="text-xs text-muted mt-1">Seed the database to populate wallet data</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto thin-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-faint border-b border-default">
                    <th className="text-left font-medium px-5 py-3">Wallet Address</th>
                    <th className="text-right font-medium px-3 py-3">ICC-YANGYUEN</th>
                    <th className="text-right font-medium px-3 py-3">Green</th>
                    <th className="text-right font-medium px-3 py-3">Together</th>
                    <th className="text-right font-medium px-3 py-3">Integrity</th>
                    <th className="text-right font-medium px-3 py-3">Fit</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => (
                    <tr key={w.id} className="tbl-row border-b border-default last:border-0">
                      <td className="px-5 py-3 font-mono text-xs text-default">{trunc(w.walletId)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-default">{parseFloat(w.balanceICC).toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-muted">{parseFloat(w.balanceGreen).toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-muted">{parseFloat(w.balanceTogether).toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-muted">{parseFloat(w.balanceIntegrity).toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-muted">{parseFloat(w.balanceFit).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 flex items-center justify-between border-t border-default text-xs text-muted">
              <span>Page {page} of {totalPages} · {total.toLocaleString()} total</span>
              <div className="flex items-center gap-1">
                <button className="btn-icon btn btn-ghost" style={{ width: 28, height: 28 }}
                  onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <Icon name="chevR" size={12} className="rotate-180" />
                </button>
                <button className="btn-icon btn btn-ghost" style={{ width: 28, height: 28 }}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <Icon name="chevR" size={12} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  )
}
