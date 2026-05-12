'use client'

import { useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/WorkspaceContext'

interface Workspace {
  id: number
  name: string
  description: string | null
  _count: { tokenContracts: number; addressContracts: number }
}

export default function WorkspacesPage() {
  const { refresh: refreshContext } = useWorkspace()
  const [rows, setRows] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; row: Workspace | null }>({ open: false, row: null })
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Workspace | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/workspaces')
    setRows(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setForm({ name: '', description: '' })
    setError(null)
    setModal({ open: true, row: null })
  }

  function openEdit(row: Workspace) {
    setForm({ name: row.name, description: row.description ?? '' })
    setError(null)
    setModal({ open: true, row })
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      let res: Response
      if (modal.row) {
        res = await fetch(`/api/workspaces/${modal.row.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        res = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Save failed')
        return
      }
      setModal({ open: false, row: null })
      await load()
      refreshContext()
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(row: Workspace) {
    setDeleting(row.id)
    const res = await fetch(`/api/workspaces/${row.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Delete failed')
    }
    setDeleting(null)
    setConfirmDelete(null)
    await load()
    refreshContext()
  }

  const canDelete = (row: Workspace) =>
    row.name !== 'SYSTEM' && row._count.tokenContracts === 0 && row._count.addressContracts === 0

  const deleteTooltip = (row: Workspace) => {
    if (row.name === 'SYSTEM') return 'Cannot delete the SYSTEM workspace'
    const total = row._count.tokenContracts + row._count.addressContracts
    if (total > 0) return `Cannot delete: ${total} contract(s) linked`
    return 'Delete workspace'
  }

  return (
    <div className="p-6 space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold text-default">Workspaces</h1>
        <p className="text-sm text-muted mt-0.5">Manage workspaces for organizing contracts and data views</p>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-default">
          <span className="font-medium text-default">All Workspaces</span>
          <button className="btn btn-primary text-xs" onClick={openAdd}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Workspace
          </button>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                <th className="text-left px-5 py-3 text-muted font-medium">Name</th>
                <th className="text-left px-5 py-3 text-muted font-medium">Description</th>
                <th className="text-left px-5 py-3 text-muted font-medium">Token Contracts</th>
                <th className="text-left px-5 py-3 text-muted font-medium">Address Contracts</th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-default">
                    <td className="px-5 py-3"><div className="shimmer h-4 rounded w-32" /></td>
                    <td className="px-5 py-3"><div className="shimmer h-4 rounded w-48" /></td>
                    <td className="px-5 py-3"><div className="shimmer h-4 rounded w-12" /></td>
                    <td className="px-5 py-3"><div className="shimmer h-4 rounded w-12" /></td>
                    <td className="px-5 py-3" />
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">No workspaces yet</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="tbl-row border-b border-default last:border-0">
                  <td className="px-5 py-3 font-medium text-default">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, rgb(var(--accent-2)), rgb(var(--accent-3)))' }}
                      >
                        {row.name.slice(0, 2).toUpperCase()}
                      </div>
                      {row.name}
                      {row.name === 'SYSTEM' && (
                        <span className="pill pill-accent text-[10px]" style={{ padding: '1px 6px' }}>System</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{row.description || '—'}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="pill" style={{ background: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>
                      {row._count.tokenContracts}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="pill" style={{ background: 'rgb(var(--accent-3) / 0.1)', color: 'rgb(var(--accent-3))' }}>
                      {row._count.addressContracts}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button className="btn btn-ghost btn-icon" onClick={() => openEdit(row)} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        className="btn btn-ghost btn-icon text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={() => canDelete(row) && setConfirmDelete(row)}
                        disabled={!canDelete(row) || deleting === row.id}
                        title={deleteTooltip(row)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModal({ open: false, row: null })} />
          <div className="relative glass-strong rounded-2xl p-6 w-full max-w-md space-y-4 animate-in">
            <h2 className="text-base font-semibold text-default">
              {modal.row ? 'Edit Workspace' : 'Add Workspace'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name <span className="text-red-400">*</span></label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Marketing"
                  disabled={modal.row?.name === 'SYSTEM'}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Description</label>
                <input
                  className="input"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button className="btn btn-ghost" onClick={() => setModal({ open: false, row: null })}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative glass-strong rounded-2xl p-6 w-full max-w-sm space-y-4 animate-in">
            <h2 className="text-base font-semibold text-default">Delete {confirmDelete.name}?</h2>
            <p className="text-sm text-muted">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn bg-red-500 text-white border-transparent hover:bg-red-600"
                onClick={() => doDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
              >
                {deleting === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
