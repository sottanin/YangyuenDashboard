'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

interface MenuItem { key: string; label: string; section: string }
interface RoleRow { id: string; name: string; description: string | null; system: boolean; permissions: Array<{ menuKey: string }>; _count: { users: number } }
interface RoleForm { name: string; description: string; menuKeys: string[] }
const emptyForm: RoleForm = { name: '', description: '', menuKeys: [] }

export default function RolesPage(): React.JSX.Element {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [editing, setEditing] = useState<RoleRow | null | undefined>(undefined)
  const [form, setForm] = useState<RoleForm>(emptyForm)
  const [error, setError] = useState('')
  const load = useCallback(async (): Promise<void> => {
    const response = await fetch('/api/roles')
    const data = await response.json() as { roles?: RoleRow[]; menuCatalog?: MenuItem[]; error?: string }
    if (!response.ok) { setError(data.error ?? 'Unable to load roles'); return }
    setRoles(data.roles ?? []); setMenus(data.menuCatalog ?? [])
  }, [])
  useEffect(() => { const timeout = window.setTimeout(() => { void load() }, 0); return () => window.clearTimeout(timeout) }, [load])
  function open(role: RoleRow | null): void { setEditing(role); setForm(role ? { name: role.name, description: role.description ?? '', menuKeys: role.permissions.map((item) => item.menuKey) } : emptyForm); setError('') }
  async function save(): Promise<void> {
    const response = await fetch(editing ? `/api/roles/${editing.id}` : '/api/roles', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const body = await response.json() as { error?: string }
    if (!response.ok) { setError(body.error ?? 'Unable to save role'); return }
    setEditing(undefined); await load()
  }
  async function remove(role: RoleRow): Promise<void> { const response = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' }); const body = await response.json() as { error?: string }; if (!response.ok) { setError(body.error ?? 'Unable to delete role'); return }; await load() }
  return <><PageHeader title="Roles" subtitle="Combine multiple roles to grant menu access; permissions are applied as a union." actions={<button className="btn btn-primary" onClick={() => open(null)}>Add role</button>} />{error && <p className="mb-4 rounded-xl border border-red-400/30 p-3 text-sm text-red-400">{error}</p>}<Card noPad><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-default text-left text-muted"><th className="px-5 py-3">Role</th><th className="px-5 py-3">Menus</th><th className="px-5 py-3">Users</th><th className="px-5 py-3" /></tr></thead><tbody>{roles.map((role) => <tr key={role.id} className="border-b border-default"><td className="px-5 py-4"><div className="font-medium text-default">{role.name}</div><div className="text-xs text-muted">{role.description ?? '—'}</div></td><td className="px-5 py-4 text-muted">{role.name === 'Superadmin' ? 'All menus' : `${role.permissions.length} menus`}</td><td className="px-5 py-4 text-muted">{role._count.users}</td><td className="px-5 py-4 text-right"><button className="btn btn-ghost" onClick={() => open(role)}>Edit</button>{!role.system && <button className="btn btn-ghost text-red-400" onClick={() => void remove(role)}>Delete</button>}</td></tr>)}</tbody></table></div></Card>{editing !== undefined && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => setEditing(undefined)} /><div className="glass-strong relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6"><h2 className="text-lg font-semibold text-default">{editing ? 'Edit role' : 'Add role'}</h2><div className="mt-4 grid gap-3"><label className="text-xs text-muted">Name<input className="input mt-1" value={form.name} disabled={editing?.name === 'Superadmin'} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="text-xs text-muted">Description<input className="input mt-1" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div><div className="mb-2 text-xs text-muted">Visible menus</div><div className="grid gap-2 sm:grid-cols-2">{menus.map((menu) => <label key={menu.key} className="flex items-center gap-2 rounded-lg border border-default p-3 text-sm text-default"><input type="checkbox" disabled={editing?.name === 'Superadmin'} checked={editing?.name === 'Superadmin' || form.menuKeys.includes(menu.key)} onChange={(event) => setForm({ ...form, menuKeys: event.target.checked ? [...form.menuKeys, menu.key] : form.menuKeys.filter((key) => key !== menu.key) })} />{menu.section} · {menu.label}</label>)}</div></div></div><div className="mt-6 flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setEditing(undefined)}>Cancel</button><button className="btn btn-primary" disabled={editing?.name === 'Superadmin'} onClick={() => void save()}>Save</button></div></div></div>}</>
}
