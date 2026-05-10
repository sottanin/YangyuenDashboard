'use client'

import { useEffect, useState, useCallback } from 'react'

interface BatchJobLog {
  id: string
  startedAt: string
  finishedAt: string | null
  status: string
  tokenName: string | null
  tokenAddress: string | null
  totalFetched: number
  totalInserted: number
  totalUpdated: number
  pagesScanned: number
  stoppedReason: string | null
  error: string | null
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'completed' ? 'pill pill-success' :
    status === 'failed'    ? 'pill pill-danger' :
    status === 'running'   ? 'pill pill-accent' :
                             'pill pill-muted'
  return <span className={cls}>{status}</span>
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' })
}

export default function BatchLogsPage() {
  const [logs, setLogs] = useState<BatchJobLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const limit = 20

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/batch/logs?page=${page}&limit=${limit}`)
    const data = await res.json()
    setLogs(data.logs)
    setTotal(data.total)
    setLoading(false)
  }, [page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Auto-refresh when any log is running
  useEffect(() => {
    const hasRunning = logs.some((l) => l.status === 'running')
    if (!hasRunning) return
    const timer = setInterval(fetchLogs, 5000)
    return () => clearInterval(timer)
  }, [logs, fetchLogs])

  async function handleRunNow() {
    setRunning(true)
    try {
      const res = await fetch('/api/batch/run', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setToast({ msg: data.message, type: 'ok' })
        fetchLogs()
      } else {
        setToast({ msg: data.message || data.error, type: 'err' })
      }
    } catch {
      setToast({ msg: 'Network error', type: 'err' })
    } finally {
      setRunning(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-default">Batch Job Logs</h1>
          <p className="text-sm text-muted mt-0.5">Blockchain data fetch history — {total} records</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleRunNow}
          disabled={running}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          {running ? 'Starting…' : 'Run Now'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`glass rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'ok' ? 'text-green-500' : 'text-red-400'}`}>
          {toast.msg}
        </div>
      )}

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                <th className="text-left px-4 py-3 text-muted font-medium">Status</th>
                <th className="text-left px-4 py-3 text-muted font-medium">Token</th>
                <th className="text-left px-4 py-3 text-muted font-medium hidden md:table-cell">Address</th>
                <th className="text-right px-4 py-3 text-muted font-medium">Pages</th>
                <th className="text-right px-4 py-3 text-muted font-medium">Fetched</th>
                <th className="text-right px-4 py-3 text-muted font-medium">Inserted</th>
                <th className="text-right px-4 py-3 text-muted font-medium">Updated</th>
                <th className="text-left px-4 py-3 text-muted font-medium hidden lg:table-cell">Stopped</th>
                <th className="text-left px-4 py-3 text-muted font-medium">Started</th>
                <th className="text-left px-4 py-3 text-muted font-medium hidden lg:table-cell">Finished</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-default">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="shimmer h-4 rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted">
                    No batch job logs yet. Click &quot;Run Now&quot; to start.
                  </td>
                </tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="tbl-row border-b border-default last:border-0">
                  <td className="px-4 py-3"><StatusPill status={log.status} /></td>
                  <td className="px-4 py-3 font-medium text-default">{log.tokenName || '—'}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs hidden md:table-cell truncate max-w-[180px]">
                    {log.tokenAddress ? `${log.tokenAddress.slice(0, 10)}…${log.tokenAddress.slice(-6)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{log.pagesScanned}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{log.totalFetched}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-500">{log.totalInserted}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-400">{log.totalUpdated}</td>
                  <td className="px-4 py-3 text-muted text-xs hidden lg:table-cell">
                    {log.error
                      ? <span className="text-red-400 truncate block max-w-[140px]" title={log.error}>{log.error.slice(0, 40)}…</span>
                      : log.stoppedReason || '—'}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmt(log.startedAt)}</td>
                  <td className="px-4 py-3 text-muted text-xs whitespace-nowrap hidden lg:table-cell">{fmt(log.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-default flex items-center justify-between">
            <span className="text-xs text-muted">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                className="btn btn-ghost text-xs"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >Prev</button>
              <button
                className="btn btn-ghost text-xs"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
