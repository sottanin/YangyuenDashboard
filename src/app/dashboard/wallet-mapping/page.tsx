'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonTable } from '@/components/ui/SkeletonCard'
import { useWorkspace } from '@/lib/WorkspaceContext'

type MappingMode = 'mapped' | 'unmapped-wallet' | 'unmapped-user'

interface MappingRow { id?: string; rowNumber?: number; userId: string; walletAddress: string; status?: 'New' | 'Duplicate' }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
interface PreviewResponse { totalRecords: number; newRecords: number; duplicateRecords: number; rows: MappingRow[]; error?: string }

export default function WalletMappingPage(): React.JSX.Element {
  const { selected } = useWorkspace()
  return <WalletMappingContent key={selected.id} />
}

function WalletMappingContent(): React.JSX.Element {
  const { selected, loading: workspaceLoading } = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [rows, setRows] = useState<MappingRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 100, total: 0, totalPages: 1 })
  const [mode, setMode] = useState<MappingMode>('mapped')
  const [mappingError, setMappingError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)
  const [working, setWorking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadMappings = useCallback(async (targetPage: number, query: string): Promise<void> => {
    if (selected.id === 'all') return
    const currentRequest = ++requestId.current
    setLoading(true)
    setMappingError('')
    setRows([])
    try {
      const params = new URLSearchParams({ workspace: String(selected.id), page: String(targetPage), mode })
      if (query) params.set('search', query)
      const response = await fetch(`/api/wallet-mapping?${params}`, { cache: 'no-store' })
      const body = await response.json() as { rows?: MappingRow[]; pagination?: Pagination; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Unable to load Wallet Mapping data')
      if (currentRequest !== requestId.current) return
      setRows(body.rows ?? [])
      setPage(body.pagination?.page ?? 1)
      setPagination(body.pagination ?? { page: 1, pageSize: 100, total: 0, totalPages: 1 })
    } catch (caught) {
      if (currentRequest === requestId.current) setMappingError(caught instanceof Error ? caught.message : 'Unable to load Wallet Mapping data')
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [selected.id, mode])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = searchInput.trim().toLowerCase()
      setSearch(query); setPage(1)
      if (!workspaceLoading && selected.id !== 'all') void loadMappings(1, query)
    }, 350)
    return () => { window.clearTimeout(timer); requestId.current += 1 }
  }, [loadMappings, searchInput, workspaceLoading, selected.id, refreshVersion])

  function choose(candidate: File | null): void {
    setError(''); setSuccess(''); setPreview(null); setOverwrite(false)
    if (!candidate) { setFile(null); return }
    if (!candidate.name.toLowerCase().endsWith('.xlsx')) { setFile(null); setError('Only .xlsx files are supported.'); return }
    if (candidate.size > 10 * 1024 * 1024) { setFile(null); setError('The Excel file must not exceed 10 MB.'); return }
    setFile(candidate)
  }

  async function submit(action: 'validate' | 'import'): Promise<void> {
    if (!file || selected.id === 'all') return
    setWorking(true); setError(''); setSuccess('')
    try {
      const form = new FormData()
      form.set('file', file); form.set('workspace', String(selected.id)); form.set('action', action); form.set('overwrite', String(overwrite))
      const response = await fetch('/api/wallet-mapping', { method: 'POST', body: form })
      const body = await response.json() as PreviewResponse & { importedRecords?: number; overwrittenRecords?: number }
      if (!response.ok) throw new Error(body.error ?? 'Unable to process Wallet Mapping data')
      if (action === 'validate') setPreview(body)
      else {
        setSuccess(`Import complete: ${(body.importedRecords ?? 0).toLocaleString()} new mappings added and ${(body.overwrittenRecords ?? 0).toLocaleString()} mappings overwritten.`)
        setPreview(null); setFile(null); setOverwrite(false); setPage(1)
        if (inputRef.current) inputRef.current.value = ''
        setRefreshVersion((version) => version + 1)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to process Wallet Mapping data')
    } finally { setWorking(false) }
  }

  const unit = mode === 'mapped' ? 'mappings' : mode === 'unmapped-wallet' ? 'wallet addresses' : 'user IDs'
  const description = mode === 'mapped' ? 'Saved User ID and Wallet Address pairs within this workspace.' : mode === 'unmapped-wallet' ? 'Wallets observed in this workspace’s token and NFT activity without a saved mapping. System and token contracts are excluded.' : 'Distinct users from this workspace’s Fitivity data without a saved mapping.'

  function changePage(nextPage: number): void { setPage(nextPage); void loadMappings(nextPage, search) }

  return <div className="min-w-0 max-w-full">
    <PageHeader title="Wallet Mapping" subtitle={`Link Fitivity users to blockchain wallet identities · ${selected.name}`} />
    {selected.id === 'all' ? <Card><div className="py-12 text-center"><h2 className="text-sm font-semibold text-default">Select a workspace</h2><p className="mt-2 text-xs text-muted">Wallet mappings are isolated by workspace.</p></div></Card> : <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
        <Card noPad>
          <div className="border-b border-default px-5 py-4"><h2 className="font-semibold text-default">Upload source file</h2><p className="mt-1 text-xs text-muted">Excel (.xlsx) · validated completely before an atomic import</p></div>
          <div className="p-5"><button type="button" disabled={working} className={`flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center transition disabled:opacity-60 ${dragging ? 'border-accent bg-accent/10' : 'border-default bg-white/[0.02] hover:border-accent/60 hover:bg-white/[0.04]'}`} onClick={() => inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!working) choose(event.dataTransfer.files[0] ?? null) }}><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-default bg-white/5 text-accent"><Icon name="arrowUp" size={22} /></span><span className="text-sm font-medium text-default">{file?.name ?? 'Drop a Wallet Mapping file here'}</span><span className="mt-1 text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · click to replace` : 'or click to browse · maximum 10 MB'}</span></button>
            <input ref={inputRef} type="file" className="sr-only" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">Validation never changes saved mappings.</p><button type="button" className="btn btn-primary min-h-11" disabled={!file || working || workspaceLoading} onClick={() => void submit('validate')}><Icon name="eye" size={15} />{working ? 'Processing…' : 'Validate & preview'}</button></div>
          </div>
        </Card>
        <Card title="Validation contract" subtitle="Both columns form the mapping identity."><ol className="space-y-2">{['User ID', 'Wallet Address'].map((column, index) => <li key={column} className="flex items-center gap-3 rounded-xl border border-default px-3 py-3 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 font-mono text-[10px] text-faint">0{index + 1}</span><span className="text-default">{column}</span></li>)}</ol><p className="mt-4 text-xs leading-5 text-muted">Wallet Address accepts EVM addresses and legacy <span className="font-mono">deleted_user_*</span> identifiers. Matching is case-insensitive while original values remain visible.</p></Card>
      </div>
      {error ? <div className="mt-4"><ErrorCard message={error} /></div> : null}
      {success ? <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm text-emerald-300" role="status"><Icon name="check" />{success}</div> : null}
      {preview ? <Card className="mt-4" noPad><div className="border-b border-default px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-default">Validated preview</h2><p className="mt-1 text-xs text-muted">{preview.totalRecords.toLocaleString()} mappings · {preview.newRecords.toLocaleString()} new · {preview.duplicateRecords.toLocaleString()} duplicate</p></div><button type="button" className="btn btn-primary min-h-10" disabled={working || (preview.newRecords === 0 && !overwrite)} onClick={() => void submit('import')}>Import {preview.totalRecords.toLocaleString()} mappings</button></div>{preview.duplicateRecords > 0 ? <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${overwrite ? 'border-amber-400/40 bg-amber-400/[0.07]' : 'border-default'}`}><input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-400" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} /><span><span className="block text-sm font-medium text-default">Overwrite {preview.duplicateRecords.toLocaleString()} duplicate mappings</span><span className="mt-0.5 block text-xs text-muted">Required to refresh original User ID and Wallet Address values for existing composite keys.</span></span></label> : null}</div><MappingTable rows={preview.rows} showStatus /><div className="border-t border-default px-5 py-3 text-xs text-muted">Showing the first {preview.rows.length.toLocaleString()} validated rows.</div></Card> : null}
      <Card className="mt-4" title="Wallet Mapping data" subtitle={description} noPad>
        <div className="flex flex-col gap-3 border-b border-default p-5 md:flex-row md:items-end">
          <label className="min-w-0 flex-1"><span className="mb-1 block text-xs font-medium text-muted">Search {unit}</span><div className="relative"><input type="search" className="input min-h-11 w-full pr-10" maxLength={200} value={searchInput} disabled={workspaceLoading} onChange={(event) => { requestId.current += 1; setRows([]); setLoading(true); setPage(1); setSearchInput(event.target.value) }} placeholder={mode === 'mapped' ? 'Search User ID or Wallet Address' : mode === 'unmapped-wallet' ? 'Search unmapped Wallet Address' : 'Search unmapped User ID'} /><Icon name="search" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" /></div></label>
          <label className="w-full md:w-64"><span className="mb-1 block text-xs font-medium text-muted">Mapping status</span><select className="input min-h-11 w-full" value={mode} disabled={workspaceLoading} onChange={(event) => { requestId.current += 1; setRows([]); setLoading(true); setPage(1); setMode(event.target.value as MappingMode) }}><option value="mapped">Mapped</option><option value="unmapped-wallet">Unmapped Wallet Address</option><option value="unmapped-user">Unmapped User ID</option></select></label>
        </div>
        <div aria-busy={loading}>{loading ? <div className="p-5"><SkeletonTable rows={6} /></div> : mappingError ? <div className="p-5"><ErrorCard message={mappingError} onRetry={() => void loadMappings(1, search)} /></div> : <MappingTable rows={rows} showStatus={false} mode={mode} />}</div>
        <nav aria-label="Wallet Mapping pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-default px-5 py-3 text-xs text-muted"><span aria-live="polite">{loading ? 'Loading…' : mappingError ? 'Results unavailable' : `${pagination.total.toLocaleString()} ${unit} · Page ${pagination.page} of ${pagination.totalPages}`}</span><div className="flex gap-2"><button className="btn btn-ghost min-h-11" disabled={page <= 1 || loading || Boolean(mappingError)} onClick={() => changePage(page - 1)}>Previous</button><button className="btn btn-ghost min-h-11" disabled={page >= pagination.totalPages || loading || Boolean(mappingError)} onClick={() => changePage(page + 1)}>Next</button></div></nav>
      </Card>
    </>}
  </div>
}

function MappingTable({ rows, showStatus, mode = 'mapped' }: { rows: MappingRow[]; showStatus: boolean; mode?: MappingMode }): React.JSX.Element {
  if (rows.length === 0) return <div className="py-16 text-center"><div className="text-sm font-medium text-default">{mode === 'mapped' ? 'No wallet mappings found' : mode === 'unmapped-wallet' ? 'No unmapped wallet addresses found' : 'No unmapped user IDs found'}</div><p className="mt-1 text-xs text-muted">{mode === 'mapped' ? 'Upload a valid workbook or change the current search.' : 'No unmatched identities in the available workspace source data. Try changing the search.'}</p></div>
  return <div className="max-h-[560px] overflow-auto thin-scroll" tabIndex={0} role="region" aria-label="Scrollable Wallet Mapping table"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 z-10 bg-[rgb(var(--surface))]"><tr className="border-b border-default text-left text-[10.5px] uppercase tracking-wider text-faint">{showStatus ? <th className="px-4 py-3">Status</th> : null}<th className="px-4 py-3">User ID</th><th className="px-4 py-3">Wallet Address</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? `${row.userId}-${row.walletAddress}-${index}`} className="tbl-row border-b border-default last:border-0">{showStatus ? <td className="px-4 py-3"><span className={`pill ${row.status === 'New' ? 'pill-success' : 'pill-danger'}`}>{row.status}</span></td> : null}<td className="px-4 py-3 font-mono text-xs text-default"><span aria-label={row.userId ? undefined : 'Not mapped'}>{row.userId || '—'}</span></td><td className="px-4 py-3 font-mono text-xs text-muted"><span aria-label={row.walletAddress ? undefined : 'Not mapped'}>{row.walletAddress || '—'}</span></td></tr>)}</tbody></table></div>
}
