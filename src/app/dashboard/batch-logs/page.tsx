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

type JobKey = 'token_sync' | 'redemption' | 'wallet_sync' | 'fee_update' | 'nft_instance'

const JOBS: { key: JobKey; label: string; desc: string }[] = [
  { key: 'token_sync',   label: 'Token Sync',          desc: 'ดึง ERC-20 transfers ทุก token' },
  { key: 'redemption',   label: 'NFT Redemption',       desc: 'ดึง ERC-721 transfers + upsert NFT' },
  { key: 'wallet_sync',  label: 'Wallet Sync',          desc: 'อัปเดต balance ทุก wallet' },
  { key: 'fee_update',   label: 'Fee Update',           desc: 'เติม fee/gas ที่ยังเป็น 0' },
  { key: 'nft_instance', label: 'NFT Instance Update',  desc: 'อัปเดต metadata + tokenValue' },
]

const ALL_KEYS = JOBS.map((j) => j.key)

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
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [selected, setSelected] = useState<Set<JobKey>>(new Set(ALL_KEYS))
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const limit = 20

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/batch/logs?page=${page}&limit=${limit}`)
    const data = await res.json()
    setLogs(data.logs)
    setTotal(data.total)
    setLoading(false)
  }, [page])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    const hasRunning = logs.some((l) => l.status === 'running')
    if (!hasRunning) return
    const timer = setInterval(fetchLogs, 5000)
    return () => clearInterval(timer)
  }, [logs, fetchLogs])

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function toggleJob(key: JobKey) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => prev.size === ALL_KEYS.length ? new Set() : new Set(ALL_KEYS))
  }

  async function handleRun() {
    if (selected.size === 0) return
    setSubmitting(true)
    try {
      const jobs = selected.size === ALL_KEYS.length ? undefined : Array.from(selected)
      const body = jobs ? JSON.stringify({ jobs }) : undefined
      const res = await fetch('/api/batch/run', {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body,
      })
      const data = await res.json()
      res.ok ? showToast(data.message, 'ok') : showToast(data.message || data.error, 'err')
      if (res.ok) fetchLogs()
    } catch {
      showToast('Network error', 'err')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch('/api/batch/cancel', { method: 'POST' })
      const data = await res.json()
      showToast(`Marked ${data.cancelled} job(s) as failed`, 'ok')
      fetchLogs()
    } catch {
      showToast('Failed to cancel', 'err')
    } finally {
      setCancelling(false)
    }
  }

  const hasRunning = logs.some((l) => l.status === 'running')
  const allSelected = selected.size === ALL_KEYS.length
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 space-y-5 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-default">Batch Job Logs</h1>
        <p className="text-sm text-muted mt-0.5">Blockchain data fetch history — {total} records</p>
      </div>

      {/* Run panel */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-default">เลือก Job ที่ต้องการรัน</span>
          <button
            onClick={toggleAll}
            className="text-xs text-muted hover:text-default transition-colors"
          >
            {allSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {JOBS.map(({ key, label, desc }) => {
            const checked = selected.has(key)
            return (
              <label
                key={key}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none
                  ${checked
                    ? 'border-accent/40 bg-accent/5'
                    : 'border-default bg-transparent hover:bg-white/3'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleJob(key)}
                  className="mt-0.5 accent-indigo-500 w-4 h-4 shrink-0"
                />
                <div>
                  <div className="text-sm font-medium text-default leading-tight">{label}</div>
                  <div className="text-xs text-muted mt-0.5 leading-snug">{desc}</div>
                </div>
              </label>
            )
          })}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={submitting || selected.size === 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            {submitting ? 'Starting…' : `Run ${selected.size === ALL_KEYS.length ? 'All' : `${selected.size} Job${selected.size > 1 ? 's' : ''}`}`}
          </button>

          {hasRunning && (
            <button
              className="btn btn-ghost text-red-400 hover:text-red-300 text-sm"
              onClick={handleCancel}
              disabled={cancelling}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {cancelling ? 'Cancelling…' : 'Stop & Mark Failed'}
            </button>
          )}
        </div>
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
                    No batch job logs yet. เลือก job แล้วกด Run เพื่อเริ่ม
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

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-default flex items-center justify-between">
            <span className="text-xs text-muted">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button className="btn btn-ghost text-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
              <button className="btn btn-ghost text-xs" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
