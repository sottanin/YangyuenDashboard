'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'

type StatusFilter = 'All' | 'New' | 'Duplicate'
type JobStatus = 'VALIDATING' | 'VALIDATED' | 'IMPORTING' | 'COMPLETED' | 'FAILED'
interface Job { id: string; status: JobStatus; progress: number; processedRecords: number; totalRecords: number; newRecords: number; duplicateRecords: number; importedRecords: number; overwrittenRecords: number; overwriteDuplicates: boolean; error: string | null; validationErrors: Array<{ row: number | null; column: string | null; message: string }> }
interface PreviewRow { id: string; rowNumber: number; userId: string; metricType: string; totalValue: string; count: number; unit: string; date: string; window: string; workspaceExternalId: string; workspaceName: string; status: 'New' | 'Duplicate' }
interface JobResponse { job: Job; rows: PreviewRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; error?: string }
interface EditableRow { id: string; userId: string; metricType: string; totalValue: string; count: number; unit: string; date: string; window: string; isCal: boolean; updatedAt: string; workspace: { id: number; name: string } }

const requiredColumns = ['User ID', 'Metric Type', 'Total Value', 'Count', 'Unit', 'Date', 'Window', 'Workspace ID']

export default function FitivityDataPage(): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: 100, total: 0, totalPages: 1 })
  const [filter, setFilter] = useState<StatusFilter>('All')
  const [page, setPage] = useState(1)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [overwriteDuplicates, setOverwriteDuplicates] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const working = uploadProgress !== null || job?.status === 'VALIDATING' || job?.status === 'IMPORTING'

  function choose(candidate: File | null): void {
    setJob(null); setRows([]); setPage(1); setFilter('All'); setError(''); setSuccess(''); setUploadProgress(null); setOverwriteDuplicates(false)
    if (!candidate) { setFile(null); return }
    if (!/\.(xlsx|csv)$/i.test(candidate.name)) { setFile(null); setError('Only .xlsx and .csv files are supported.'); return }
    setFile(candidate)
  }

  const loadJob = useCallback(async (jobId: string, targetPage: number, targetFilter: StatusFilter): Promise<JobResponse> => {
    const params = new URLSearchParams({ jobId, page: String(targetPage) })
    if (targetFilter !== 'All') params.set('status', targetFilter)
    const response = await fetch(`/api/fitivity-data?${params}`, { cache: 'no-store' })
    const body = await response.json() as JobResponse
    if (!response.ok) throw new Error(body.error ?? 'Unable to read validation progress')
    setJob(body.job); setRows(body.rows); setPagination(body.pagination)
    if (body.job.status === 'FAILED') setError(body.job.error ?? 'File validation failed')
    if (body.job.status === 'COMPLETED') setSuccess(`Import complete: ${body.job.importedRecords.toLocaleString()} new records added${body.job.overwriteDuplicates ? ` and ${body.job.overwrittenRecords.toLocaleString()} duplicate records overwritten` : ` and ${body.job.duplicateRecords.toLocaleString()} duplicates skipped`}.`)
    return body
  }, [])

  useEffect(() => {
    if (!job || (job.status !== 'VALIDATING' && job.status !== 'IMPORTING')) return
    const timer = window.setInterval(() => void loadJob(job.id, 1, filter).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to read job status')), 1000)
    return () => window.clearInterval(timer)
  }, [job, filter, loadJob])

  function startValidation(): void {
    if (!file) return
    setError(''); setSuccess(''); setJob(null); setRows([]); setUploadProgress(0)
    const form = new FormData(); form.set('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/fitivity-data')
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100)) }
    xhr.onerror = () => { setUploadProgress(null); setError('Unable to connect to the upload service.') }
    xhr.onload = () => {
      setUploadProgress(null)
      const body = (xhr.response ?? {}) as { jobId?: string; error?: string }
      if (xhr.status < 200 || xhr.status >= 300 || !body.jobId) { setError(body.error ?? 'Unable to start validation'); return }
      void loadJob(body.jobId, 1, 'All').catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to read validation progress'))
    }
    xhr.send(form)
  }

  async function startImport(): Promise<void> {
    if (!job || job.status !== 'VALIDATED') return
    setError(''); setSuccess('')
    const response = await fetch('/api/fitivity-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import', jobId: job.id, overwriteDuplicates }) })
    const body = await response.json() as { error?: string }
    if (!response.ok) { setError(body.error ?? 'Unable to start import'); return }
    await loadJob(job.id, 1, filter)
  }

  function changeFilter(value: StatusFilter): void {
    setFilter(value); setPage(1)
    if (job) void loadJob(job.id, 1, value).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load preview'))
  }

  function changePage(nextPage: number): void {
    setPage(nextPage)
    if (job) void loadJob(job.id, nextPage, filter).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load preview'))
  }

  return <>
    <PageHeader title="Fitivity Data" subtitle="Validate health and activity records before adding them to the workspace dataset." actions={<button type="button" className={`btn min-h-11 ${editOpen ? 'btn-primary' : ''}`} onClick={() => setEditOpen((value) => !value)}><Icon name={editOpen ? 'arrowUp' : 'edit'} size={15} />{editOpen ? 'Close Edit Data' : 'Edit Data'}</button>} />
    {editOpen ? <div className="mb-4"><EditDataPanel /></div> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
      <Card className="overflow-hidden" noPad>
        <div className="border-b border-default px-5 py-4"><h2 className="font-semibold text-default">Upload source file</h2><p className="mt-1 text-xs text-muted">Excel (.xlsx) or CSV · processed safely in background batches</p></div>
        <div className="p-5">
          <button type="button" disabled={working} className={`group flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${dragging ? 'border-accent bg-accent/10' : 'border-default bg-white/[0.02] hover:border-accent/60 hover:bg-white/[0.04]'}`} onClick={() => inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!working) choose(event.dataTransfer.files[0] ?? null) }}>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-default bg-white/5 text-accent"><Icon name="arrowUp" size={22} /></span>
            <span className="text-sm font-medium text-default">{file ? file.name : 'Drop a Fitivity file here'}</span>
            <span className="mt-1 text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · click to replace` : 'or click to browse from your computer'}</span>
          </button>
          <input ref={inputRef} type="file" className="sr-only" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-muted">Validation writes only to staging. Data is imported after your confirmation.</div><button className="btn btn-primary min-h-11" disabled={!file || working} onClick={startValidation}><Icon name="eye" size={15} /> Validate & preview</button></div>
          {uploadProgress !== null && <ProgressBar label="Uploading source file" value={uploadProgress} detail="Sending file to the validation queue" />}
          {job?.status === 'VALIDATING' && <ProgressBar label="Validating data" value={job.progress} detail={`${job.processedRecords.toLocaleString()} of ${job.totalRecords ? job.totalRecords.toLocaleString() : '…'} records checked`} />}
          {job?.status === 'IMPORTING' && <ProgressBar label="Uploading validated data" value={job.progress} detail={`${(job.importedRecords + job.overwrittenRecords).toLocaleString()} of ${(job.newRecords + (job.overwriteDuplicates ? job.duplicateRecords : 0)).toLocaleString()} records processed`} />}
        </div>
      </Card>
      <Card title="Validation contract" subtitle="All eight columns must be present in this order."><ol className="space-y-2">{requiredColumns.map((column, index) => <li key={column} className="flex items-center gap-3 rounded-xl border border-default px-3 py-2 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 font-mono text-[10px] text-faint">{String(index + 1).padStart(2, '0')}</span><span className="text-default">{column}</span></li>)}</ol></Card>
    </div>

    {error && <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/5 p-4" role="alert"><div className="flex items-start gap-3"><Icon name="alert" className="mt-0.5 shrink-0 text-red-400" /><div><div className="text-sm font-semibold text-red-300">Processing failed</div><p className="mt-1 text-sm text-red-200/80">{error}</p></div></div>{job?.validationErrors?.length ? <ul className="mt-3 max-h-44 space-y-1 overflow-y-auto border-t border-red-400/20 pt-3 text-xs text-red-200/80 thin-scroll">{job.validationErrors.map((item, index) => <li key={`${item.row}-${item.column}-${index}`}>{item.row ? `Row ${item.row}` : 'File'}{item.column ? ` · ${item.column}` : ''}: {item.message}</li>)}</ul> : null}</div>}
    {success && <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm text-emerald-300" role="status"><Icon name="check" />{success}</div>}

    {job && (job.status === 'VALIDATED' || job.status === 'COMPLETED') && <section className="mt-4 space-y-4" aria-label="Fitivity data preview">
      <div className="grid gap-4 sm:grid-cols-3"><Summary label="Records" value={job.totalRecords} tone="neutral" /><Summary label="New" value={job.newRecords} tone="new" /><Summary label="Duplicate" value={job.duplicateRecords} tone="duplicate" /></div>
      <Card noPad>
        <div className="flex flex-col gap-3 border-b border-default px-5 py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-default">Preview data</h2><p className="mt-1 text-xs text-muted">Showing 100 records per page. Duplicates use User ID + Metric Type + Date + Workspace ID.</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl border border-default p-1">{(['All', 'New', 'Duplicate'] as const).map((value) => <button key={value} type="button" className={`rounded-lg px-3 py-1.5 text-xs transition ${filter === value ? 'bg-white/10 text-default' : 'text-muted hover:text-default'}`} onClick={() => changeFilter(value)}>{value}</button>)}</div>{job.status === 'VALIDATED' && <button className="btn btn-primary min-h-10" disabled={job.newRecords === 0 && (!overwriteDuplicates || job.duplicateRecords === 0)} onClick={() => void startImport()}>Upload {(job.newRecords + (overwriteDuplicates ? job.duplicateRecords : 0)).toLocaleString()} records</button>}</div></div>{job.status === 'VALIDATED' && job.duplicateRecords > 0 && <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${overwriteDuplicates ? 'border-amber-400/40 bg-amber-400/[0.07]' : 'border-default bg-white/[0.02]'}`}><input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-400" checked={overwriteDuplicates} onChange={(event) => setOverwriteDuplicates(event.target.checked)} /><span><span className="block text-sm font-medium text-default">Overwrite {job.duplicateRecords.toLocaleString()} duplicate records</span><span className="mt-0.5 block text-xs text-muted">Confirm to replace Total Value, Count, Unit, and Window in existing records. Leave unchecked to skip duplicates.</span></span></label>}</div>
        <div className="max-h-[560px] overflow-auto thin-scroll" role="region" aria-label="Scrollable Fitivity preview table"><table className="min-w-[1180px] w-full text-sm"><thead className="sticky top-0 z-10 bg-[rgb(var(--surface))]"><tr className="border-b border-default text-left text-[10px] uppercase tracking-wider text-faint"><th className="px-4 py-3">Status</th><th className="px-4 py-3">User ID</th><th className="px-4 py-3">Metric Type</th><th className="px-4 py-3 text-right">Total Value</th><th className="px-4 py-3 text-right">Count</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Window</th><th className="px-4 py-3">Workspace</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="tbl-row border-b border-default last:border-0"><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${row.status === 'New' ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300' : 'border-red-400/35 bg-red-400/10 text-red-300'}`}>{row.status}</span></td><td className="px-4 py-3 font-mono text-xs text-default">{row.userId}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${metricTagClass(row.metricType)}`}>{row.metricType}</span></td><td className="px-4 py-3 text-right font-mono text-xs">{row.totalValue}</td><td className="px-4 py-3 text-right font-mono text-xs">{row.count}</td><td className="px-4 py-3 text-muted">{row.unit}</td><td className="px-4 py-3 font-mono text-xs text-muted">{row.date}</td><td className="px-4 py-3 text-muted">{row.window}</td><td className="px-4 py-3"><div className="text-xs text-default">{row.workspaceName}</div><div className="font-mono text-[10px] text-faint">{row.workspaceExternalId}</div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="py-14 text-center text-sm text-muted">No {filter.toLowerCase()} records in this file.</div>}</div>
        <div className="flex items-center justify-between border-t border-default px-5 py-3 text-xs text-muted"><span>{pagination.total.toLocaleString()} records · Page {pagination.page.toLocaleString()} of {pagination.totalPages.toLocaleString()}</span><div className="flex gap-2"><button className="btn min-h-9 px-3" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><button className="btn min-h-9 px-3" disabled={page >= pagination.totalPages} onClick={() => changePage(page + 1)}>Next</button></div></div>
      </Card>
    </section>}
  </>
}

function ProgressBar({ label, value, detail }: { label: string; value: number; detail: string }): React.JSX.Element {
  return <div className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.05] p-3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><div className="mb-2 flex items-start justify-between gap-4 text-xs"><div><div className="font-medium text-default">{label}</div><div className="mt-0.5 text-faint">{detail}</div></div><span className="font-mono text-accent">{value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-[width] duration-300 ease-out" style={{ width: `${value}%` }} /></div></div>
}

function EditDataPanel(): React.JSX.Element {
  const [userId, setUserId] = useState('')
  const [metricType, setMetricType] = useState('')
  const [date, setDate] = useState('')
  const [rows, setRows] = useState<EditableRow[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canSearch = userId.trim().length > 0 && metricType.length > 0 && date.length > 0 && !loading

  async function search(): Promise<void> {
    if (!canSearch) return
    setLoading(true); setError(''); setSearched(false)
    try {
      const response = await fetch('/api/fitivity-data/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: userId.trim(), metricType, date }) })
      const body = await response.json() as { rows?: EditableRow[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Unable to search Fitivity data')
      setRows(body.rows ?? []); setSearched(true)
    } catch (caught) {
      setRows([]); setError(caught instanceof Error ? caught.message : 'Unable to search Fitivity data')
    } finally { setLoading(false) }
  }

  function replaceRow(row: EditableRow): void {
    setRows((current) => current.map((item) => item.id === row.id ? row : item))
  }

  return <Card noPad>
    <div className="border-b border-default px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon name="edit" /></span><div><h2 className="font-semibold text-default">Edit Fitivity data</h2><p className="mt-0.5 text-xs text-muted">Enter all three search values. Only Total Value and IsCal can be changed.</p></div></div></div>
    <div className="grid gap-3 p-5 md:grid-cols-[minmax(220px,1fr)_minmax(220px,.7fr)_minmax(170px,.45fr)_auto] md:items-end">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">User ID<input className="input min-h-11" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Exact User ID" /></label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">Metric Type<select className="input min-h-11" value={metricType} onChange={(event) => setMetricType(event.target.value)}><option value="">Select metric</option><option value="steps">steps</option><option value="active_energy_burned">active_energy_burned</option><option value="sleep_awake">sleep_awake</option><option value="sleep_deep">sleep_deep</option><option value="sleep_light">sleep_light</option><option value="sleep_rem">sleep_rem</option></select></label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">Date<input className="input min-h-11" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <button type="button" className="btn btn-primary min-h-11" disabled={!canSearch} onClick={() => void search()}><Icon name="search" />{loading ? 'Searching…' : 'Search'}</button>
    </div>
    {error ? <div className="mx-5 mb-5 rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-300" role="alert">{error}</div> : null}
    {searched ? <div className="border-t border-default">
      {rows.length ? <div className="overflow-x-auto thin-scroll"><table className="w-full min-w-[1060px] text-sm"><thead><tr className="border-b border-default text-left text-[10px] uppercase tracking-wider text-faint"><th className="px-4 py-3">User ID</th><th className="px-4 py-3">Metric Type</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3 text-right">Count</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Editable values</th></tr></thead><tbody>{rows.map((row) => <EditableDataRow key={row.id} row={row} onSaved={replaceRow} />)}</tbody></table></div> : <div className="px-5 py-12 text-center text-sm text-muted">No Fitivity data matches all three values.</div>}
    </div> : null}
  </Card>
}

function EditableDataRow({ row, onSaved }: { row: EditableRow; onSaved: (row: EditableRow) => void }): React.JSX.Element {
  const [totalValue, setTotalValue] = useState(row.totalValue)
  const [isCal, setIsCal] = useState(row.isCal)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const changed = totalValue !== row.totalValue || isCal !== row.isCal

  async function save(): Promise<void> {
    if (!changed || saving) return
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/fitivity-data/records', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, totalValue, isCal, updatedAt: row.updatedAt }) })
      const body = await response.json() as { row?: EditableRow; error?: string }
      if (!response.ok || !body.row) throw new Error(body.error ?? 'Unable to save record')
      onSaved(body.row); setTotalValue(body.row.totalValue); setIsCal(body.row.isCal); setMessage('Saved')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Unable to save record') }
    finally { setSaving(false) }
  }

  return <tr className="tbl-row border-b border-default last:border-0 align-top">
    <td className="px-4 py-4 font-mono text-xs text-default">{row.userId}</td><td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${metricTagClass(row.metricType)}`}>{row.metricType}</span></td><td className="px-4 py-4 font-mono text-xs text-muted">{row.date}</td><td className="px-4 py-4 text-xs text-default">{row.workspace.name}</td><td className="px-4 py-4 text-right font-mono text-xs">{row.count}</td><td className="px-4 py-4 text-xs text-muted">{row.unit}</td>
    <td className="px-4 py-3"><div className="flex min-w-[330px] items-end gap-2"><label className="flex flex-1 flex-col gap-1 text-[10px] uppercase tracking-wider text-faint">Total Value<input className="input min-h-10 font-mono text-xs" inputMode="decimal" value={totalValue} onChange={(event) => { setTotalValue(event.target.value); setMessage('') }} /></label><label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-faint">IsCal<select className="input min-h-10" value={isCal ? 'yes' : 'no'} onChange={(event) => { setIsCal(event.target.value === 'yes'); setMessage('') }}><option value="yes">Yes</option><option value="no">No</option></select></label><button type="button" className="btn btn-primary min-h-10" disabled={!changed || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button></div>{message ? <div className={`mt-1.5 text-xs ${message === 'Saved' ? 'text-emerald-400' : 'text-red-400'}`} role="status">{message}</div> : null}</td>
  </tr>
}

function Summary({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'new' | 'duplicate' }): React.JSX.Element {
  const styles = tone === 'new' ? 'border-emerald-400/25 bg-emerald-400/[0.04]' : tone === 'duplicate' ? 'border-amber-400/25 bg-amber-400/[0.04]' : 'border-default bg-white/[0.02]'
  return <div className={`rounded-2xl border p-4 ${styles}`}><div className="text-[10px] font-medium uppercase tracking-[.14em] text-faint">{label}</div><div className="mt-2 text-2xl font-semibold text-default">{value.toLocaleString()}</div></div>
}

function metricTagClass(metricType: string): string {
  if (metricType === 'steps') return 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300'
  if (metricType === 'active_energy_burned') return 'border-orange-400/35 bg-orange-400/10 text-orange-300'
  if (metricType === 'sleep_awake') return 'border-amber-400/35 bg-amber-400/10 text-amber-300'
  if (metricType === 'sleep_deep') return 'border-indigo-400/35 bg-indigo-400/10 text-indigo-300'
  if (metricType === 'sleep_light') return 'border-violet-400/35 bg-violet-400/10 text-violet-300'
  return 'border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-300'
}
