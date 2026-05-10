'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { KpiTile } from '@/components/ui/KpiTile'
import { SkeletonKpi } from '@/components/ui/SkeletonCard'
import { Icon } from '@/components/ui/Icon'

interface RedemptionRow {
  id: string
  txId: string
  fromHash: string
  toHash: string
  tokenName: string
  tokenSymbol: string
  tokenId: string | null
  fee: string
  value: string
  timestamp: string
  status: string | null
  method: string
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

export default function RedemptionsPage() {
  const [rows, setRows] = useState<RedemptionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statsTotal, setStatsTotal] = useState(0)

  const fetchRows = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/redemptions?page=${p}&limit=20`)
      const data = await res.json()
      setRows(data.redemptions || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRows(page)
    fetch('/api/stats').then(r => r.json()).then(s => {
      setStatsTotal(s.totalRedemptions || 0)
    }).catch(() => {})
  }, [page, fetchRows])

  return (
    <>
      <PageHeader
        title="Redemption Transactions"
        subtitle={`${total.toLocaleString()} total NFT redemption events`}
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
          <KpiTile label="Total Redemptions" value={statsTotal.toLocaleString()} change={0}
            spark={[10,12,15,14,18,20,22]} icon="refresh" />
          <KpiTile label="This Page" value={rows.length.toLocaleString()} change={0}
            spark={[5,8,10,9,12,14,15]} icon="cart" sparkColor="var(--success)" />
          <KpiTile label="Unique NFTs" value={new Set(rows.map(r => r.tokenId).filter(Boolean)).size.toLocaleString()} change={0}
            spark={[3,4,5,6,7,8,9]} icon="box" sparkColor="var(--accent-3)" />
          <KpiTile label="Avg Fee" value={
            rows.length > 0
              ? (rows.reduce((s, r) => s + parseFloat(r.fee), 0) / rows.length).toFixed(6)
              : '—'
          } change={0}
            spark={[1,1,1,2,2,2,2]} icon="target" sparkColor="var(--warn)" />
        </div>
      )}

      <Card title="All Redemption Transactions" subtitle="Latest first" noPad>
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
            <div className="text-sm font-medium text-default">No redemption transactions found</div>
            <div className="text-xs text-muted mt-1">Seed the database or run the batch job to populate data</div>
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
                    <th className="text-left font-medium px-3 py-3">Token ID</th>
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
                        <td className="px-3 py-3 font-mono text-xs text-default">{r.tokenId ?? '—'}</td>
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
