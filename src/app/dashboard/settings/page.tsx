'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

type Tab = 'reporting' | 'batch'
interface ConfigValues {
  reportingTimezone: string
  businessHistoryStart: string
  defaultReportRangeDays: string
  aggregateMarketplaceVersions: string
  batchCutoffDays: string
  batchScheduleEnabled: string
}
interface Readiness {
  ready: boolean
  checks: { activeTokenContracts: number; activeSystemAddresses: number; redemptionNftConfigured: boolean; businessHistoryStartConfigured: boolean }
  latestJobs: Array<{ id: string; status: string; tokenName: string | null; startedAt: string; error: string | null }>
}

const EMPTY_CONFIG: ConfigValues = {
  reportingTimezone: 'Asia/Bangkok', businessHistoryStart: '2025-10-29T14:02:37+07:00', defaultReportRangeDays: '30',
  aggregateMarketplaceVersions: 'true', batchCutoffDays: '7', batchScheduleEnabled: 'false',
}

function localDateTimeValue(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/)
  return match ? `${match[1]}T${match[2]}` : value
}

export default function SettingsPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('reporting')
  const [saved, setSaved] = useState<ConfigValues>(EMPTY_CONFIG)
  const [form, setForm] = useState<ConfigValues>(EMPTY_CONFIG)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(form), [saved, form])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true); setError(null)
    try {
      const [configResponse, readinessResponse] = await Promise.all([fetch('/api/config'), fetch('/api/system/readiness')])
      if (!configResponse.ok || !readinessResponse.ok) throw new Error('Unable to load SYSTEM settings')
      const config = await configResponse.json() as ConfigValues
      setSaved(config); setForm(config); setReadiness(await readinessResponse.json() as Readiness)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load SYSTEM settings')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  async function save(): Promise<void> {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const response = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: form }) })
      const result = await response.json() as ConfigValues & { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to save settings')
      setSaved(result); setForm(result); setSuccess('SYSTEM settings saved successfully.')
      const readinessResponse = await fetch('/api/system/readiness')
      if (readinessResponse.ok) setReadiness(await readinessResponse.json() as Readiness)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save settings')
    } finally { setSaving(false) }
  }

  return (
    <>
      <PageHeader title="SYSTEM Settings" subtitle="Configure reporting rules and verify data readiness." />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="SYSTEM settings">
        <button type="button" role="tab" aria-selected={tab === 'reporting'} className={`btn min-h-11 ${tab === 'reporting' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('reporting')}>General Reporting</button>
        <button type="button" role="tab" aria-selected={tab === 'batch'} className={`btn min-h-11 ${tab === 'batch' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('batch')}>Batch &amp; Data Sync</button>
      </div>
      {loading ? <div className="shimmer h-96 max-w-3xl rounded-2xl" /> : error && !readiness ? (
        <Card className="max-w-3xl"><div className="space-y-3 text-sm text-red-400"><p>{error}</p><button className="btn btn-ghost min-h-11" onClick={() => void load()}>Try again</button></div></Card>
      ) : (
        <div className="max-w-3xl space-y-4">
          {tab === 'reporting' ? (
            <Card title="General Reporting" subtitle="These values are the shared source of truth for every dashboard report.">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2 text-xs font-medium text-muted">Reporting timezone<input className="input" value={form.reportingTimezone} onChange={(event) => setForm({ ...form, reportingTimezone: event.target.value })} placeholder="Asia/Bangkok" /></label>
                <label className="space-y-2 text-xs font-medium text-muted">Business history starts<input type="datetime-local" step="1" className="input" value={localDateTimeValue(form.businessHistoryStart)} onChange={(event) => setForm({ ...form, businessHistoryStart: `${event.target.value}+07:00` })} /></label>
                <label className="space-y-2 text-xs font-medium text-muted">Default report range<select className="input" value={form.defaultReportRangeDays} onChange={(event) => setForm({ ...form, defaultReportRangeDays: event.target.value })}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All history</option></select></label>
                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-default p-3 text-sm text-default md:col-span-2"><input type="checkbox" checked={form.aggregateMarketplaceVersions === 'true'} onChange={(event) => setForm({ ...form, aggregateMarketplaceVersions: String(event.target.checked) })} />Combine Marketplace v1 and v2 in business totals</label>
              </div>
              <div className="mt-6 rounded-xl border border-default bg-surface-2 p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Report interpretation rules</h3><ul className="mt-3 grid gap-2 text-xs text-muted md:grid-cols-2"><li>• Address matching is case-insensitive; raw casing is preserved.</li><li>• Marketplace versions are audited separately and may be combined.</li><li>• One transaction header can contain many detail events.</li><li>• KAP-20, KAP-22 and KAP-721 are business standards.</li></ul></div>
            </Card>
          ) : (
            <>
              <Card title="Batch & Data Sync" subtitle="Control the hourly data pipeline and its ingestion window.">
                <div className={`mb-5 rounded-xl border p-4 transition-colors ${form.batchScheduleEnabled === 'true' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-default bg-surface-2'}`}>
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                    <span><span className="block text-sm font-semibold text-default">Hourly Batch Schedule</span><span className="mt-1 block text-xs text-muted">Runs the full Batch &amp; Data Sync pipeline at the start of every hour.</span></span>
                    <span className="relative inline-flex shrink-0 items-center">
                      <input type="checkbox" className="peer sr-only" checked={form.batchScheduleEnabled === 'true'} onChange={(event) => setForm({ ...form, batchScheduleEnabled: String(event.target.checked) })} />
                      <span className="h-7 w-12 rounded-full border border-default bg-surface transition-colors peer-checked:border-emerald-500/50 peer-checked:bg-emerald-500/80 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
                      <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                    </span>
                  </label>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className={`pill ${form.batchScheduleEnabled === 'true' ? 'pill-success' : 'pill-muted'}`}>{form.batchScheduleEnabled === 'true' ? 'Schedule enabled' : 'Schedule paused'}</span><span className="text-muted">Turning this off prevents future scheduled runs; it does not cancel a job already running.</span></div>
                </div>
                <label className="block space-y-2 text-xs font-medium text-muted">Batch cutoff<select className="input max-w-sm" value={form.batchCutoffDays} onChange={(event) => setForm({ ...form, batchCutoffDays: event.target.value })}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All available history</option></select><span className="block font-normal text-faint">The scheduler reads this setting again at the beginning of every run.</span></label>
                <Link href="/dashboard/batch-logs" className="btn btn-ghost mt-5 min-h-11">Open Batch Logs</Link>
              </Card>
              <Card title="Reporting readiness" subtitle={readiness?.ready ? 'SYSTEM registry is ready for report development.' : 'Complete the missing registry items before building reports.'}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReadinessItem label="Active token contracts" ready={Boolean(readiness?.checks.activeTokenContracts)} value={String(readiness?.checks.activeTokenContracts ?? 0)} />
                  <ReadinessItem label="Active system addresses" ready={Boolean(readiness?.checks.activeSystemAddresses)} value={String(readiness?.checks.activeSystemAddresses ?? 0)} />
                  <ReadinessItem label="Redemption NFT contract" ready={Boolean(readiness?.checks.redemptionNftConfigured)} value={readiness?.checks.redemptionNftConfigured ? 'Configured' : 'Missing'} />
                  <ReadinessItem label="Business history start" ready={Boolean(readiness?.checks.businessHistoryStartConfigured)} value={readiness?.checks.businessHistoryStartConfigured ? 'Configured' : 'Missing'} />
                </div>
                <div className="mt-5 flex gap-3"><Link href="/dashboard/contracts" className="btn btn-ghost min-h-11">Review Registry</Link><Link href="/dashboard/batch-logs" className="btn btn-ghost min-h-11">Latest sync status</Link></div>
              </Card>
            </>
          )}
          {(error || success) && <div role="status" className={`rounded-xl border p-3 text-sm ${error ? 'border-red-400/30 text-red-400' : 'border-emerald-400/30 text-emerald-500'}`}>{error ?? success}</div>}
          <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn btn-ghost min-h-11" disabled={!dirty || saving} onClick={() => { setForm(saved); setError(null); setSuccess(null) }}>Discard changes</button><button type="button" className="btn btn-primary min-h-11" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save settings'}</button></div>
        </div>
      )}
    </>
  )
}

function ReadinessItem({ label, ready, value }: { label: string; ready: boolean; value: string }): React.JSX.Element {
  return <div className="flex min-h-14 items-center justify-between rounded-xl border border-default p-3"><span className="text-xs text-muted">{label}</span><span className={`pill ${ready ? 'pill-success' : 'pill-danger'}`}>{value}</span></div>
}
