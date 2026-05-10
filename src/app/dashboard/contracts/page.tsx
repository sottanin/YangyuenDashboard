'use client'

import { useEffect, useState } from 'react'

interface Contract { id: string; name: string; address: string }

function ContractTable({
  type,
  endpoint,
}: {
  type: string
  endpoint: string
}) {
  const [rows, setRows] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; row: Contract | null }>({ open: false, row: null })
  const [form, setForm] = useState({ name: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Contract | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch(endpoint)
    setRows(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setForm({ name: '', address: '' })
    setError(null)
    setModal({ open: true, row: null })
  }

  function openEdit(row: Contract) {
    setForm({ name: row.name, address: row.address })
    setError(null)
    setModal({ open: true, row })
  }

  async function save() {
    if (!form.name.trim() || !form.address.trim()) {
      setError('Name and address are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let res: Response
      if (modal.row) {
        res = await fetch(`${endpoint}/${modal.row.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        res = await fetch(endpoint, {
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
      load()
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(row: Contract) {
    setDeleting(row.id)
    await fetch(`${endpoint}/${row.id}`, { method: 'DELETE' })
    setDeleting(null)
    setConfirmDelete(null)
    load()
  }

  return (
    <>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-default">
          <span className="font-medium text-default">{type}</span>
          <button className="btn btn-primary text-xs" onClick={openAdd}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add
          </button>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                <th className="text-left px-5 py-3 text-muted font-medium">Name</th>
                <th className="text-left px-5 py-3 text-muted font-medium">Address</th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-default">
                    <td className="px-5 py-3"><div className="shimmer h-4 rounded w-32" /></td>
                    <td className="px-5 py-3"><div className="shimmer h-4 rounded w-64" /></td>
                    <td className="px-5 py-3" />
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-10 text-center text-muted">No records yet</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="tbl-row border-b border-default last:border-0">
                  <td className="px-5 py-3 font-medium text-default">{row.name}</td>
                  <td className="px-5 py-3 text-muted font-mono text-xs">{row.address}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button className="btn btn-ghost btn-icon" onClick={() => openEdit(row)} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        className="btn btn-ghost btn-icon text-red-400"
                        onClick={() => setConfirmDelete(row)}
                        disabled={deleting === row.id}
                        title="Delete"
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

      {/* Edit/Add Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModal({ open: false, row: null })} />
          <div className="relative glass-strong rounded-2xl p-6 w-full max-w-md space-y-4 animate-in">
            <h2 className="text-base font-semibold text-default">
              {modal.row ? `Edit ${type}` : `Add ${type}`}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. ICC-YANGYUEN"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Contract Address</label>
                <input
                  className="input font-mono text-xs"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="0x..."
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
    </>
  )
}

export default function ContractsPage() {
  const [tab, setTab] = useState<'token' | 'address'>('token')

  return (
    <div className="p-6 space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold text-default">Contracts</h1>
        <p className="text-sm text-muted mt-0.5">Manage token and address contract records</p>
      </div>

      {/* Tabs */}
      <div className="seg w-fit">
        <button className={tab === 'token' ? 'active' : ''} onClick={() => setTab('token')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
          Token Contracts
        </button>
        <button className={tab === 'address' ? 'active' : ''} onClick={() => setTab('address')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          Address Contracts
        </button>
      </div>

      {tab === 'token' && (
        <ContractTable type="Token Contract" endpoint="/api/contracts/token" />
      )}
      {tab === 'address' && (
        <ContractTable type="Address Contract" endpoint="/api/contracts/address" />
      )}
    </div>
  )
}
