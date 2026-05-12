'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'

interface AdminUser {
  id: string
  username: string
  name: string
  email: string | null
  role: string
  active: boolean
  lastLoginAt: string | null
  createdAt: string
}

const emptyForm = {
  username: '',
  name: '',
  email: '',
  role: 'admin',
  password: '',
  active: true,
}

function formatDate(value: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null })
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin-users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  function openAdd() {
    setForm(emptyForm)
    setError(null)
    setModal({ open: true, user: null })
  }

  function openEdit(user: AdminUser) {
    setForm({
      username: user.username,
      name: user.name,
      email: user.email || '',
      role: user.role,
      password: '',
      active: user.active,
    })
    setError(null)
    setModal({ open: true, user })
  }

  async function save() {
    if (!form.username.trim() || !form.name.trim() || (!modal.user && !form.password)) {
      setError('Username, name, and password are required')
      return
    }

    setSaving(true)
    setError(null)

    const endpoint = modal.user ? `/api/admin-users/${modal.user.id}` : '/api/admin-users'
    const res = await fetch(endpoint, {
      method: modal.user ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Save failed')
      setSaving(false)
      return
    }

    setSaving(false)
    setModal({ open: false, user: null })
    load()
  }

  async function deleteUser(user: AdminUser) {
    const res = await fetch(`/api/admin-users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Delete failed')
      setConfirmDelete(null)
      return
    }
    setConfirmDelete(null)
    load()
  }

  return (
    <>
      <PageHeader
        title="Admin Users"
        subtitle="Manage dashboard authentication accounts and roles"
        actions={(
          <button className="btn btn-primary" onClick={openAdd}>
            <Icon name="plus" size={14} />
            Add Admin
          </button>
        )}
      />

      <Card noPad>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                <th className="text-left px-5 py-3 text-muted font-medium">User</th>
                <th className="text-left px-5 py-3 text-muted font-medium">Role</th>
                <th className="text-left px-5 py-3 text-muted font-medium">Status</th>
                <th className="text-left px-5 py-3 text-muted font-medium">Last Login</th>
                <th className="px-5 py-3 w-28" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-default">
                    <td className="px-5 py-4"><div className="shimmer h-5 rounded w-44" /></td>
                    <td className="px-5 py-4"><div className="shimmer h-5 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="shimmer h-5 rounded w-20" /></td>
                    <td className="px-5 py-4"><div className="shimmer h-5 rounded w-36" /></td>
                    <td className="px-5 py-4" />
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">No admin users yet</td></tr>
              ) : users.map((user) => (
                <tr key={user.id} className="tbl-row border-b border-default last:border-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="avatar" style={{ width: 32, height: 32, fontSize: '11px' }}>
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-default">{user.name}</div>
                        <div className="text-xs text-faint">{user.email || user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={user.role === 'superadmin' ? 'pill pill-accent' : 'pill pill-muted'}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={user.active ? 'pill pill-success' : 'pill pill-danger'}>
                      {user.active ? 'active' : 'disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted">{formatDate(user.lastLoginAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button className="btn btn-ghost btn-icon" onClick={() => openEdit(user)} title="Edit">
                        <Icon name="edit" size={14} />
                      </button>
                      <button className="btn btn-ghost btn-icon text-red-400" onClick={() => setConfirmDelete(user)} title="Delete">
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModal({ open: false, user: null })} />
          <div className="relative glass-strong rounded-2xl p-6 w-full max-w-lg space-y-4 animate-in">
            <h2 className="text-base font-semibold text-default">
              {modal.user ? 'Edit Admin User' : 'Add Admin User'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-muted mb-1">Username</span>
                <input className="input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-xs text-muted mb-1">Name</span>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-xs text-muted mb-1">Email</span>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label className="block">
                <span className="block text-xs text-muted mb-1">Role</span>
                <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="admin">admin</option>
                  <option value="superadmin">superadmin</option>
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm text-default">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Active
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-xs text-muted mb-1">
                  Password {modal.user ? '(leave blank to keep current)' : ''}
                </span>
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn btn-ghost" onClick={() => setModal({ open: false, user: null })}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative glass-strong rounded-2xl p-6 w-full max-w-sm space-y-4 animate-in">
            <h2 className="text-base font-semibold text-default">Delete {confirmDelete.name}?</h2>
            <p className="text-sm text-muted">This removes the admin login account permanently.</p>
            <div className="flex justify-end gap-3">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn bg-red-500 text-white border-transparent hover:bg-red-600" onClick={() => deleteUser(confirmDelete)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
