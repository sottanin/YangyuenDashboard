'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { TokenAvatar } from '@/components/ui/TokenAvatar'

interface NFTInstanceRow {
  id: string
  imageUrl: string | null
  name: string
  ownerHash: string
  tokenAddress: string
  normalizedTokenAddress: string
  tokenValue: string | null
  isNotReplace: boolean
}

interface ContractOption { tokenAddress: string; normalizedTokenAddress: string }
interface ListResponse {
  rows: NFTInstanceRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  contracts: ContractOption[]
  error?: string
}
interface EditForm { imageUrl: string; name: string; tokenValue: string; isNotReplace: boolean }

function compact(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`
}

function imageProxyUrl(row: Pick<NFTInstanceRow, 'normalizedTokenAddress' | 'id' | 'imageUrl'>): string | null {
  if (!row.imageUrl) return null
  return `/api/nft-instances/${encodeURIComponent(row.normalizedTokenAddress)}/${encodeURIComponent(row.id)}/image`
}

export default function NFTInstancesPage(): React.JSX.Element {
  const [data, setData] = useState<ListResponse | null>(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [protection, setProtection] = useState<'all' | 'protected' | 'replaceable'>('all')
  const [contract, setContract] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<NFTInstanceRow | null>(null)
  const [form, setForm] = useState<EditForm>({ imageUrl: '', name: '', tokenValue: '', isNotReplace: false })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true); setError(null)
    const params = new URLSearchParams({ page: String(page), pageSize: '25', protection })
    if (search) params.set('search', search)
    if (contract) params.set('contract', contract)
    try {
      const response = await fetch(`/api/nft-instances?${params}`, { signal })
      const result = await response.json() as ListResponse
      if (!response.ok) throw new Error(result.error ?? 'Unable to load NFT instances')
      setData(result)
      if (page > result.totalPages) setPage(result.totalPages)
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setError(loadError instanceof Error ? loadError.message : 'Unable to load NFT instances')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [contract, page, protection, search])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => { void load(controller.signal) }, 0)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [load])

  useEffect(() => {
    if (!editing) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) setEditing(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [editing, saving])

  function applySearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault(); setPage(1); setSearch(searchInput.trim())
  }

  function openEdit(row: NFTInstanceRow): void {
    setEditing(row)
    setForm({ imageUrl: row.imageUrl ?? '', name: row.name, tokenValue: row.tokenValue ?? '', isNotReplace: row.isNotReplace })
    setFormError(null)
  }

  async function save(): Promise<void> {
    if (!editing) return
    setSaving(true); setFormError(null)
    try {
      const response = await fetch(`/api/nft-instances/${encodeURIComponent(editing.normalizedTokenAddress)}/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: form.imageUrl.trim() || null, name: form.name.trim(), tokenValue: form.tokenValue.trim() || null, isNotReplace: form.isNotReplace }),
      })
      const result = await response.json() as NFTInstanceRow & { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to update NFT instance')
      setEditing(null)
      await load()
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Unable to update NFT instance')
    } finally { setSaving(false) }
  }

  return <>
    <PageHeader title="NFT Instances" subtitle="Review NFT metadata and protect manual values from the NFT Instance Update batch job." />
    <div className="mb-5 grid gap-3 xl:grid-cols-[minmax(280px,1fr)_240px_190px]">
      <form className="flex gap-2" onSubmit={applySearch}>
        <label htmlFor="nft-instance-search" className="sr-only">Search NFT instances</label>
        <input id="nft-instance-search" type="search" maxLength={128} className="input min-w-0 flex-1" placeholder="Search token ID, name, owner or contract…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        <button className="btn btn-primary min-h-11" type="submit">Search</button>
      </form>
      <label className="sr-only" htmlFor="nft-instance-contract">Filter by contract</label>
      <select id="nft-instance-contract" className="input" value={contract} onChange={(event) => { setPage(1); setContract(event.target.value) }}><option value="">All contracts</option>{data?.contracts.map((item) => <option key={item.normalizedTokenAddress} value={item.normalizedTokenAddress}>{compact(item.tokenAddress)}</option>)}</select>
      <label className="sr-only" htmlFor="nft-instance-protection">Filter by replacement protection</label>
      <select id="nft-instance-protection" className="input" value={protection} onChange={(event) => { setPage(1); setProtection(event.target.value as 'all' | 'protected' | 'replaceable') }}><option value="all">All replacement states</option><option value="protected">Protected</option><option value="replaceable">Replaceable</option></select>
    </div>
    {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-red-400/30 p-3 text-sm text-red-400"><span>{error}</span><button className="btn btn-ghost min-h-11" onClick={() => void load()}>Retry</button></div>}
    <div className="glass overflow-hidden rounded-2xl">
      <div className="overflow-x-auto thin-scroll" tabIndex={0} role="region" aria-label="NFT instances table"><table className="w-full min-w-[1120px] text-sm"><thead><tr className="border-b border-default text-left text-xs text-muted"><th className="px-5 py-4 font-medium">NFT</th><th className="px-5 py-4 font-medium">Token ID</th><th className="px-5 py-4 font-medium">Contract</th><th className="px-5 py-4 font-medium">Owner</th><th className="px-5 py-4 text-right font-medium">Token value</th><th className="px-5 py-4 font-medium">Batch replacement</th><th className="px-5 py-4 font-medium"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{loading ? Array.from({ length: 7 }, (_, index) => <tr key={index} className="border-b border-default"><td colSpan={7} className="px-5 py-4"><div className="shimmer h-7 rounded" /></td></tr>) : !data || data.rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-16 text-center"><div className="font-medium text-default">No NFT instances found</div><p className="mt-1 text-xs text-muted">{search || contract || protection !== 'all' ? 'No records match the current filters.' : 'Run NFT Redemption Sync to populate NFT instances.'}</p></td></tr> : data.rows.map((row) => <tr key={`${row.normalizedTokenAddress}:${row.id}`} className="tbl-row border-b border-default last:border-0"><td className="px-5 py-4"><div className="flex min-w-52 items-center gap-3"><TokenAvatar src={imageProxyUrl(row)} symbol={row.name} size="lg" /><div className="min-w-0"><div className="truncate font-medium text-default" title={row.name}>{row.name}</div><div className="max-w-56 truncate text-xs text-muted" title={row.imageUrl ?? undefined}>{row.imageUrl ?? 'No image URL'}</div></div></div></td><td className="px-5 py-4 font-mono text-xs text-default" title={row.id}>{compact(row.id)}</td><td className="px-5 py-4 font-mono text-xs text-muted" title={row.tokenAddress}>{compact(row.tokenAddress)}</td><td className="px-5 py-4 font-mono text-xs text-muted" title={row.ownerHash}>{compact(row.ownerHash)}</td><td className="px-5 py-4 text-right font-mono text-xs text-default">{row.tokenValue ?? '—'}</td><td className="px-5 py-4"><span className={`pill ${row.isNotReplace ? 'pill-success' : 'pill-muted'}`}>{row.isNotReplace ? 'Protected' : 'Replaceable'}</span></td><td className="px-5 py-4 text-right"><button className="btn btn-ghost min-h-11" onClick={() => openEdit(row)}>Edit</button></td></tr>)}</tbody></table></div>
      {data && <nav className="flex flex-col items-start justify-between gap-3 border-t border-default px-5 py-3 text-xs text-muted sm:flex-row sm:items-center" aria-label="NFT instance pages"><span aria-live="polite">Page {data.page} of {data.totalPages} · {data.total.toLocaleString()} instances</span><div className="flex gap-2"><button className="btn btn-ghost min-h-11" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button className="btn btn-ghost min-h-11" disabled={page >= data.totalPages || loading} onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))}>Next</button></div></nav>}
    </div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-nft-title"><button className="absolute inset-0 bg-black/50" aria-label="Close dialog" onClick={() => setEditing(null)} /><div className="glass-strong relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 thin-scroll"><div className="flex items-center gap-3"><TokenAvatar src={imageProxyUrl(editing)} symbol={form.name || editing.name} size="lg" /><div className="min-w-0"><h2 id="edit-nft-title" className="text-lg font-semibold text-default">Edit NFT instance</h2><p className="truncate font-mono text-xs text-muted" title={`${editing.tokenAddress}:${editing.id}`}>{compact(editing.tokenAddress)} · Token ID {editing.id}</p></div></div><div className="mt-5 grid gap-4">
      <Field label="Name"><input className="input" autoFocus required maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="Image URL"><input className="input" type="text" inputMode="url" maxLength={2048} placeholder="ipfs://… or https://…" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} /><span className="block text-[11px] font-normal text-faint">Use ipfs://, bitkubipfs.io, or ipfs.io.</span></Field>
      <Field label="Token value"><input className="input font-mono" inputMode="decimal" placeholder="0.00" value={form.tokenValue} onChange={(event) => setForm({ ...form, tokenValue: event.target.value })} /><span className="block text-[11px] font-normal text-faint">Enter an exact non-negative decimal value. Leave blank for no value.</span></Field>
      <label className="flex items-start gap-3 rounded-xl border border-default p-4 text-sm text-default"><input type="checkbox" className="mt-1" checked={form.isNotReplace} onChange={(event) => setForm({ ...form, isNotReplace: event.target.checked })} /><span><span className="block font-medium">Prevent batch replacement</span><span className="mt-1 block text-xs text-muted">When selected, NFT Instance Update keeps this name, image URL, and token value. Blockchain-derived ownership fields continue to update during redemption sync.</span></span></label>
    </div>{formError && <p className="mt-4 rounded-xl border border-red-400/30 p-3 text-sm text-red-400">{formError}</p>}<div className="mt-6 flex justify-end gap-3"><button className="btn btn-ghost min-h-11" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary min-h-11" disabled={saving || !form.name.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button></div></div></div>}
  </>
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return <label className="space-y-2 text-xs font-medium text-muted">{label}{children}</label>
}
