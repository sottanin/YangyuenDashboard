'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { TokenAvatar } from '@/components/ui/TokenAvatar'
import { DEFAULT_TOKEN_CHART_COLOR, TOKEN_CHART_COLORS } from '@/lib/tokenChartColors'

type RegistryTab = 'token' | 'address'
interface Workspace { id: number; name: string }
interface RegistryRecord {
  id: string; name: string; address: string; normalizedAddress: string; role: string; active: boolean; workspaceId: number | null; workspace: Workspace | null
  symbol?: string | null; standard?: string | null; decimals?: number | null; version?: string | null; imageUrl?: string | null; chartColor?: string; aggregateAcrossWorkspaces: boolean
}
interface RegistryForm {
  name: string; address: string; symbol: string; standard: string; decimals: string; role: string; version: string; workspaceId: string; active: boolean; chartColor: string; aggregateAcrossWorkspaces: boolean
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const TOKEN_ROLES = ['PRIMARY_TOKEN', 'POINT_TOKEN', 'REDEMPTION_NFT', 'OTHER']
const ADDRESS_ROLES = ['ZERO', 'INITIAL_MINT', 'MAIN', 'WORKSPACE', 'DISTRIBUTOR_POOL', 'OPERATION_POOL', 'LOYALTY_SWAP', 'MARKETPLACE', 'MARKETPLACE_FEE', 'OTHER']
const EMPTY_FORM: RegistryForm = { name: '', address: '', symbol: '', standard: 'KAP-20', decimals: '18', role: 'OTHER', version: '', workspaceId: '', active: true, chartColor: DEFAULT_TOKEN_CHART_COLOR, aggregateAcrossWorkspaces: false }

function cleanTokenName(name: string, symbol: string | null | undefined): string {
  const trimmed = name.trim()
  if (!symbol) return trimmed
  const suffix = ` (${symbol})`
  return trimmed.toLowerCase().endsWith(suffix.toLowerCase()) ? trimmed.slice(0, -suffix.length).trim() : trimmed
}

export default function ContractsPage(): React.JSX.Element {
  const [tab, setTab] = useState<RegistryTab>('token')
  const [records, setRecords] = useState<Record<RegistryTab, RegistryRecord[]>>({ token: [], address: [] })
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; record: RegistryRecord | null }>({ open: false, record: null })
  const [form, setForm] = useState<RegistryForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true); setLoadError(null)
    try {
      const [tokensResponse, addressesResponse, workspacesResponse] = await Promise.all([fetch('/api/contracts/token'), fetch('/api/contracts/address'), fetch('/api/workspaces')])
      if (!tokensResponse.ok || !addressesResponse.ok || !workspacesResponse.ok) throw new Error('Unable to load registry data')
      const tokenRows = await tokensResponse.json() as RegistryRecord[]
      setRecords({ token: tokenRows.map((record) => ({ ...record, imageUrl: record.imageUrl ? `${record.imageUrl}?v=${Date.now()}` : null })), address: await addressesResponse.json() as RegistryRecord[] })
      setWorkspaces(await workspacesResponse.json() as Workspace[])
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Unable to load registry data') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    const timeout = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const visible = useMemo(() => records[tab].filter((record) => {
    const query = search.trim().toLowerCase()
    const matchesText = !query || [record.name, record.address, record.role, record.symbol ?? '', record.standard ?? '', record.version ?? ''].some((value) => value.toLowerCase().includes(query))
    return matchesText && (activeFilter === 'all' || record.active === (activeFilter === 'active'))
  }), [records, tab, search, activeFilter])

  function systemWorkspaceId(): string { return String(workspaces.find((workspace) => workspace.name === 'SYSTEM')?.id ?? '') }
  function openAdd(): void {
    setForm({ ...EMPTY_FORM, workspaceId: systemWorkspaceId(), role: tab === 'token' ? 'OTHER' : 'OTHER' }); setFormError(null); setModal({ open: true, record: null })
  }
  function openEdit(record: RegistryRecord): void {
    setForm({ name: tab === 'token' ? cleanTokenName(record.name, record.symbol) : record.name, address: record.address, symbol: record.symbol ?? '', standard: record.standard ?? 'KAP-20', decimals: record.decimals === null || record.decimals === undefined ? '' : String(record.decimals), role: record.role, version: record.version ?? '', workspaceId: record.workspaceId ? String(record.workspaceId) : '', active: record.active, chartColor: record.chartColor ?? DEFAULT_TOKEN_CHART_COLOR, aggregateAcrossWorkspaces: record.aggregateAcrossWorkspaces })
    setFormError(null); setModal({ open: true, record })
  }
  function changeRole(role: string): void {
    setForm((current) => ({ ...current, role, aggregateAcrossWorkspaces: role === 'MARKETPLACE' ? current.aggregateAcrossWorkspaces : false, ...(tab === 'address' && role === 'ZERO' ? { address: ZERO_ADDRESS } : {}) }))
  }
  async function save(): Promise<void> {
    setSaving(true); setFormError(null)
    const endpoint = `/api/contracts/${tab}`
    const payload = tab === 'token'
      ? { name: form.name, address: form.address, symbol: form.symbol, standard: form.standard, decimals: form.standard === 'KAP-721' ? null : Number(form.decimals), role: form.role, workspaceId: form.workspaceId ? Number(form.workspaceId) : null, active: form.active, chartColor: form.chartColor, aggregateAcrossWorkspaces: form.aggregateAcrossWorkspaces }
      : { name: form.name, address: form.address, role: form.role, version: form.version || null, workspaceId: form.workspaceId ? Number(form.workspaceId) : null, active: form.active, aggregateAcrossWorkspaces: form.aggregateAcrossWorkspaces }
    try {
      const response = await fetch(modal.record ? `${endpoint}/${modal.record.id}` : endpoint, { method: modal.record ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to save registry record')
      setModal({ open: false, record: null }); await load()
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Unable to save registry record') }
    finally { setSaving(false) }
  }
  async function deactivate(record: RegistryRecord): Promise<void> {
    if (!window.confirm(`${record.active ? 'Deactivate or remove' : 'Remove'} ${record.name}? Canonical SYSTEM records will be retained as inactive.`)) return
    const response = await fetch(`/api/contracts/${tab}/${record.id}`, { method: 'DELETE' })
    if (!response.ok) { const body = await response.json() as { error?: string }; setLoadError(body.error ?? 'Unable to update registry record'); return }
    await load()
  }
  async function uploadImage(file: File): Promise<void> {
    if (!modal.record || tab !== 'token') return
    setImageBusy(true); setFormError(null)
    const data = new FormData(); data.set('image', file)
    try {
      const response = await fetch(`/api/contracts/token/${modal.record.id}/image`, { method: 'POST', body: data })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to upload image')
      await load(); setModal((current) => ({ ...current, record: current.record ? { ...current.record, imageUrl: `/api/contracts/token/${current.record.id}/image?v=${Date.now()}` } : null }))
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Unable to upload image') }
    finally { setImageBusy(false) }
  }
  async function removeImage(): Promise<void> {
    if (!modal.record || tab !== 'token') return
    setImageBusy(true); setFormError(null)
    try {
      const response = await fetch(`/api/contracts/token/${modal.record.id}/image`, { method: 'DELETE' })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to remove image')
      await load(); setModal((current) => ({ ...current, record: current.record ? { ...current.record, imageUrl: null } : null }))
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Unable to remove image') }
    finally { setImageBusy(false) }
  }

  return (
    <>
      <PageHeader title="Registry" subtitle="Manage report-ready token contracts and system address roles." actions={<button className="btn btn-primary min-h-11" onClick={openAdd}>Add {tab === 'token' ? 'token' : 'system address'}</button>} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2" role="tablist" aria-label="Registry type"><button role="tab" aria-selected={tab === 'token'} className={`btn min-h-11 ${tab === 'token' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('token')}>Token Registry</button><button role="tab" aria-selected={tab === 'address'} className={`btn min-h-11 ${tab === 'address' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('address')}>System Address Registry</button></div>
        <div className="flex gap-2"><label className="sr-only" htmlFor="registry-search">Search registry</label><input id="registry-search" className="input min-w-64" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, address, role…" /><label className="sr-only" htmlFor="registry-status">Filter status</label><select id="registry-status" className="input w-36" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as 'all' | 'active' | 'inactive')}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      </div>
      {loadError && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-400/30 p-3 text-sm text-red-400"><span>{loadError}</span><button className="btn btn-ghost min-h-11" onClick={() => void load()}>Retry</button></div>}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto thin-scroll"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-default text-left text-xs text-muted">{tab === 'token' && <th className="px-5 py-4 font-medium">Image</th>}<th className="px-5 py-4 font-medium">Name</th>{tab === 'token' && <><th className="px-5 py-4 font-medium">Symbol</th><th className="px-5 py-4 font-medium">Standard</th><th className="px-5 py-4 font-medium">Chart color</th></>}<th className="px-5 py-4 font-medium">Address</th><th className="px-5 py-4 font-medium">Role</th>{tab === 'address' && <th className="px-5 py-4 font-medium">Version</th>}<th className="px-5 py-4 font-medium">Workspace</th><th className="px-5 py-4 font-medium">Status</th><th className="px-5 py-4 font-medium"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{loading ? Array.from({ length: 5 }, (_, index) => <tr key={index} className="border-b border-default"><td colSpan={11} className="px-5 py-4"><div className="shimmer h-5 rounded" /></td></tr>) : visible.length === 0 ? <tr><td colSpan={11} className="px-5 py-16 text-center text-muted">{records[tab].length === 0 ? 'No registry records yet.' : 'No records match the current filters.'}</td></tr> : visible.map((record) => <tr key={record.id} className="tbl-row border-b border-default last:border-0">{tab === 'token' && <td className="px-5 py-4"><TokenAvatar src={record.imageUrl} symbol={record.symbol ?? record.name} size="sm" /></td>}<td className="px-5 py-4 font-medium text-default">{tab === 'token' ? cleanTokenName(record.name, record.symbol) : record.name}</td>{tab === 'token' && <><td className="px-5 py-4 font-mono text-xs text-muted">{record.symbol ?? '—'}</td><td className="px-5 py-4 text-muted">{record.standard}{record.decimals === null ? '' : ` · ${record.decimals}`}</td><td className="px-5 py-4"><span className="inline-flex items-center gap-2 text-xs text-muted"><span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: record.chartColor ?? DEFAULT_TOKEN_CHART_COLOR }} />{TOKEN_CHART_COLORS.find((color) => color.value === record.chartColor)?.label ?? 'Default Violet'}</span></td></>}<td className="max-w-64 truncate px-5 py-4 font-mono text-xs text-muted" title={record.address}>{record.address}</td><td className="px-5 py-4"><span className="pill pill-accent">{record.role}</span></td>{tab === 'address' && <td className="px-5 py-4 text-muted">{record.version ?? '—'}</td>}<td className="px-5 py-4 text-muted">{record.workspace?.name ?? '—'}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-1"><span className={`pill ${record.active ? 'pill-success' : 'pill-muted'}`}>{record.active ? 'Active' : 'Inactive'}</span>{record.aggregateAcrossWorkspaces && <span className="pill pill-accent">Cross-workspace</span>}</div></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button className="btn btn-ghost min-h-11" onClick={() => openEdit(record)}>Edit</button><button className="btn btn-ghost min-h-11 text-red-400" onClick={() => void deactivate(record)}>{record.active ? 'Deactivate' : 'Remove'}</button></div></td></tr>)}</tbody></table></div>
      </div>
      {modal.open && <RegistryModal tab={tab} record={modal.record} form={form} workspaces={workspaces} saving={saving} imageBusy={imageBusy} error={formError} setForm={setForm} changeRole={changeRole} close={() => setModal({ open: false, record: null })} save={() => void save()} uploadImage={(file) => void uploadImage(file)} removeImage={() => void removeImage()} />}
    </>
  )
}

function RegistryModal({ tab, record, form, workspaces, saving, imageBusy, error, setForm, changeRole, close, save, uploadImage, removeImage }: { tab: RegistryTab; record: RegistryRecord | null; form: RegistryForm; workspaces: Workspace[]; saving: boolean; imageBusy: boolean; error: string | null; setForm: (form: RegistryForm) => void; changeRole: (role: string) => void; close: () => void; save: () => void; uploadImage: (file: File) => void; removeImage: () => void }): React.JSX.Element {
  const zeroReadOnly = tab === 'address' && form.role === 'ZERO'
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="registry-modal-title"><button className="absolute inset-0 bg-black/50" aria-label="Close dialog" onClick={close} /><div className="glass-strong relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 thin-scroll"><h2 id="registry-modal-title" className="text-lg font-semibold text-default">{record ? 'Edit' : 'Add'} {tab === 'token' ? 'token' : 'system address'}</h2><div className="mt-5 grid gap-4 md:grid-cols-2">
    <Field label={tab === 'token' ? 'Name' : 'Display name'}><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
    {tab === 'token' && <Field label="Symbol"><input className="input uppercase" value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} /></Field>}
    <Field label="Role"><select className="input" value={form.role} onChange={(event) => changeRole(event.target.value)}>{(tab === 'token' ? TOKEN_ROLES : ADDRESS_ROLES).map((role) => <option key={role} value={role}>{role}</option>)}</select></Field>
    {tab === 'token' ? <><Field label="Standard"><select className="input" value={form.standard} onChange={(event) => setForm({ ...form, standard: event.target.value, decimals: event.target.value === 'KAP-721' ? '' : form.decimals || '18', aggregateAcrossWorkspaces: event.target.value === 'KAP-721' ? form.aggregateAcrossWorkspaces : false })}><option>KAP-20</option><option>KAP-22</option><option>KAP-721</option></select></Field><Field label="Decimals"><input type="number" min="0" max="36" className="input" disabled={form.standard === 'KAP-721'} value={form.decimals} onChange={(event) => setForm({ ...form, decimals: event.target.value })} /></Field></> : form.role === 'MARKETPLACE' && <Field label="Version"><input className="input" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} placeholder="v1" /></Field>}
    <Field label="Contract / wallet address" className="md:col-span-2"><input className="input font-mono text-xs" readOnly={zeroReadOnly} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="0x…" /></Field>
    {tab === 'token' && <div className="md:col-span-2 rounded-xl border border-default p-4"><div className="flex flex-wrap items-center gap-4"><TokenAvatar src={record?.imageUrl} symbol={form.symbol || form.name || 'Token'} size="lg" /><div className="min-w-0 flex-1"><div className="text-sm font-medium text-default">Token image</div><p className="mt-1 text-xs text-muted">PNG, JPEG or WebP, up to 2 MB.</p></div>{record ? <div className="flex flex-wrap gap-2"><label className="btn btn-ghost min-h-11 cursor-pointer">{imageBusy ? 'Working…' : record.imageUrl ? 'Replace' : 'Upload'}<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={imageBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadImage(file); event.target.value = '' }} /></label>{record.imageUrl && <button type="button" className="btn btn-ghost min-h-11 text-red-400" disabled={imageBusy} onClick={removeImage}>Remove</button>}</div> : <p className="text-xs text-muted">Save the token first, then edit it to upload an image.</p>}</div></div>}
    {tab === 'token' && <Field label="Chart color" className="md:col-span-2"><div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Token chart color">{TOKEN_CHART_COLORS.map((color) => <button key={color.value} type="button" role="radio" aria-checked={form.chartColor === color.value} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-xs transition ${form.chartColor === color.value ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.12)] text-default' : 'border-default text-muted hover:text-default'}`} onClick={() => setForm({ ...form, chartColor: color.value })}><span className="h-5 w-5 shrink-0 rounded-full border border-white/20" style={{ backgroundColor: color.value }} /><span className="truncate">{color.label}</span></button>)}</div></Field>}
    <Field label={tab === 'token' ? 'Workspace (required)' : 'Workspace'}><select className="input" required={tab === 'token'} value={form.workspaceId} onChange={(event) => setForm({ ...form, workspaceId: event.target.value })}><option value="">{tab === 'token' ? 'Select workspace' : 'No workspace'}</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></Field>
    {((tab === 'token' && form.standard === 'KAP-721') || (tab === 'address' && form.role === 'MARKETPLACE')) && <label className="flex min-h-11 items-start gap-3 rounded-xl border border-default px-3 py-3 text-sm text-default md:col-span-2"><input type="checkbox" className="mt-0.5" checked={form.aggregateAcrossWorkspaces} onChange={(event) => setForm({ ...form, aggregateAcrossWorkspaces: event.target.checked })} /><span><span className="block font-medium">Include across workspaces</span><span className="mt-1 block text-xs font-normal text-muted">Combine this {tab === 'token' ? 'KAP-721 contract' : 'marketplace address'} in workspace report totals.</span></span></label>}
    <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-default px-3 text-sm text-default"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Active for reporting</label>
  </div>{error && <p className="mt-4 rounded-xl border border-red-400/30 p-3 text-sm text-red-400">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button className="btn btn-ghost min-h-11" disabled={saving} onClick={close}>Cancel</button><button className="btn btn-primary min-h-11" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save record'}</button></div></div></div>
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }): React.JSX.Element { return <label className={`space-y-2 text-xs font-medium text-muted ${className}`}>{label}{children}</label> }
