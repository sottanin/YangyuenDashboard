'use client'

import { useEffect, useState } from 'react'

interface ReportScopeProps {
  from?: string
  to?: string
  timezone?: string
  dataThrough?: string | null
  snapshotAt?: string | null
  comparisonNote?: string
  scopeNote?: string
}

function displayDate(value: string, timezone: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const parsed = new Date(dateOnly ? `${value}T12:00:00Z` : value)
  if (!Number.isFinite(parsed.getTime())) return 'ยังไม่มีข้อมูล'
  return new Intl.DateTimeFormat('th-TH', { timeZone: dateOnly ? 'UTC' : timezone, dateStyle: 'medium', ...(dateOnly ? {} : { timeStyle: 'short' as const }) }).format(parsed)
}

export function ReportScope({ from, to, timezone = 'Asia/Bangkok', dataThrough, snapshotAt, comparisonNote, scopeNote }: ReportScopeProps): React.JSX.Element {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()))
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const latest = dataThrough ? new Date(dataThrough.length === 10 ? `${dataThrough}T23:59:59+07:00` : dataThrough).getTime() : null
  const stale = now !== null && latest !== null && Number.isFinite(latest) && now - latest > 48 * 60 * 60 * 1000
  return <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-default bg-surface/40 px-4 py-3 text-xs text-muted" role="status">
    {from && to ? <span><span className="font-medium text-default">ช่วงวันที่แสดง:</span> {displayDate(from, timezone)} – {displayDate(to, timezone)} · {timezone}</span> : null}
    {dataThrough !== undefined ? <span><span className="font-medium text-default">ข้อมูลล่าสุดที่บันทึก:</span> {dataThrough ? displayDate(dataThrough, timezone) : 'ยังไม่มีข้อมูล'}{stale ? <span className="ml-2 inline-flex rounded border border-amber-500/30 px-1.5 py-0.5 text-amber-600 dark:text-amber-300">ข้อมูลล่าสุดเกิน 2 วันแล้ว ควรตรวจสอบการอัปเดต</span> : null}</span> : null}
    {snapshotAt !== undefined ? <span><span className="font-medium text-default">ยอดคงเหลือ ณ</span> {snapshotAt ? displayDate(snapshotAt, timezone) : 'ยังไม่มีข้อมูล'}</span> : null}
    {comparisonNote ? <span className="basis-full">{comparisonNote}</span> : null}
    {scopeNote ? <details className="basis-full"><summary className="w-fit cursor-pointer rounded py-1 font-medium text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">อ่านคำอธิบายเพิ่มเติม</summary><p className="mt-1 max-w-5xl leading-relaxed">{scopeNote}</p></details> : null}
  </div>
}
