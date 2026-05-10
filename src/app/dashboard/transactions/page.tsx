'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { KpiTile } from '@/components/ui/KpiTile'
import { AreaChart } from '@/components/charts/AreaChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { SkeletonKpi, SkeletonCard, SkeletonTable } from '@/components/ui/SkeletonCard'
import { Icon } from '@/components/ui/Icon'

interface TxRow {
  id: string
  txId: string
  fromHash: string
  toHash: string
  tokenName: string
  value: string
  fee: string
  timestamp: string
  status: string | null
  txType: string
}

function trunc(s: string, n = 12) {
  if (!s || s.length <= n) return s
  return s.slice(0, 6) + '...' + s.slice(-4)
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_PILL: Record<string, string> = {
  success: 'pill-success', ok: 'pill-success',
  error: 'pill-danger', failed: 'pill-danger',
  pending: 'pill-warn',
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalTx: 0, totalVolume: 0, avgFee: 0, failedCount: 0 })

  const fetchTx = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/transactions?page=${p}&limit=20`)
      const data = await res.json()
      setRows(data.transactions || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTx(page)
    fetch('/api/stats').then(r => r.json()).then(s => {
      setStats({
        totalTx: s.totalTransactions || 0,
        totalVolume: 0,
        avgFee: 0,
        failedCount: 0,
      })
    }).catch(() => {})
  }, [page, fetchTx])

  const HOURLY = Array.from({ length: 24 }, (_, i) => ({
    label: `${i}:00`,
    orders: Math.round(80 + Math.sin(i * 0.5) * 40 + (i > 8 && i < 22 ? 50 : 0)),
  }))

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${total.toLocaleString()} total blockchain transactions`}
        actions={
          <>
            <button className="btn btn-ghost"><Icon name="filter" size={14} />Filters</button>
            <button className="btn btn-primary"><Icon name="download" size={14} />Export CSV</button>
          </>
        }
      />

      {loading && !rows.length ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {[0,1,2,3].map(i => <SkeletonKpi key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiTile label="Total Transactions" value={stats.totalTx.toLocaleString()} change={8.6}
            spark={[180,190,210,220,230,240,247]} icon="cart" />
          <KpiTile label="Total Volume" value="—" change={0}
            spark={[30,32,35,38,40,45,48]} icon="pulse" sparkColor="var(--success)" />
          <KpiTile label="Avg Fee" value="—" change={0}
            spark={[185,188,190,192,195,196,198]} icon="target" sparkColor="var(--accent-3)" />
          <KpiTile label="Redemption Txs" value={(stats.totalTx * 0.07 | 0).toLocaleString()} change={-0.6}
            spark={[2.4,2.3,2.2,2.0,1.9,1.9,1.8]} icon="refresh" sparkColor="var(--warn)" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2">
          <Card title="Hourly Transaction Count" subtitle="Pattern · last 24h">
            <AreaChart
              data={HOURLY}
              height={240}
              keys={[{ key: 'orders', label: 'Transactions', color: 'var(--accent)' }]}
            />
          </Card>
        </div>
        <Card title="Status Breakdown" subtitle="All transactions">
          <DonutChart
            data={[
              { label: 'Success', value: 78, color: 'rgb(16 185 129)' },
              { label: 'Pending', value: 12, color: 'rgb(245 158 11)' },
              { label: 'Error', value: 6, color: 'rgb(244 63 94)' },
              { label: 'Other', value: 4, color: 'rgb(148 163 184)' },
            ]}
            centerLabel="Total"
            centerValue={total > 0 ? (total / 1000).toFixed(1) + 'K' : '0'}
            size={170}
            thickness={20}
          />
        </Card>
      </div>

      <Card title="All Transactions" subtitle="Latest first" noPad>
        {loading ? (
          <div className="p-5 space-y-3">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="flex gap-3">
                <div className="shimmer w-24 h-4 rounded" />
                <div className="shimmer flex-1 h-4 rounded" />
                <div className="shimmer w-20 h-4 rounded" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-sm font-medium text-default">No transactions found</div>
            <div className="text-xs text-muted mt-1">Seed the database to populate transaction data</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto thin-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-faint border-b border-default">
                    <th className="text-left font-medium px-5 py-3">TX ID</th>
                    <th className="text-left font-medium px-3 py-3">From</th>
                    <th className="text-left font-medium px-3 py-3">To</th>
                    <th className="text-left font-medium px-3 py-3">Token</th>
                    <th className="text-right font-medium px-3 py-3">Value</th>
                    <th className="text-right font-medium px-3 py-3">Fee</th>
                    <th className="text-left font-medium px-3 py-3">Time</th>
                    <th className="text-left font-medium px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const statusKey = (r.status || 'ok').toLowerCase()
                    const pillClass = STATUS_PILL[statusKey] || 'pill-muted'
                    return (
                      <tr key={r.id} className="tbl-row border-b border-default last:border-0">
                        <td className="px-5 py-3 font-mono text-xs text-default">
                          <a
                            href={`https://www.kubscan.com/tx/${r.txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-accent transition-colors"
                            title={r.txId}
                          >
                            {trunc(r.txId, 14)}
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 flex-shrink-0"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          </a>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-muted">{trunc(r.fromHash)}</td>
                        <td className="px-3 py-3 font-mono text-xs text-muted">{trunc(r.toHash)}</td>
                        <td className="px-3 py-3 text-xs text-default">{r.tokenName}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{parseFloat(r.value).toFixed(4)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-muted">{parseFloat(r.fee).toFixed(6)}</td>
                        <td className="px-3 py-3 text-xs text-muted">{fmtTime(r.timestamp)}</td>
                        <td className="px-3 py-3"><span className={`pill ${pillClass}`}>{r.status || 'ok'}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 flex items-center justify-between border-t border-default text-xs text-muted">
              <span>Page {page} of {totalPages} · {total.toLocaleString()} total</span>
              <div className="flex items-center gap-1">
                <button
                  className="btn-icon btn btn-ghost"
                  style={{ width: 28, height: 28 }}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <Icon name="chevR" size={12} className="rotate-180" />
                </button>
                <button
                  className="btn-icon btn btn-ghost"
                  style={{ width: 28, height: 28 }}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
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
