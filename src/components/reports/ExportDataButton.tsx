'use client'

import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { downloadExcel, type ExcelExportData } from '@/lib/reporting/exportExcel'

interface Props {
  title: string
  filename: string
  disabled: boolean
  getData: () => ExcelExportData | Promise<ExcelExportData>
}

export function ExportDataButton({ title, filename, disabled, getData }: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const pending = useRef(false)
  const exportData = async (): Promise<void> => {
    if (pending.current || disabled) return
    pending.current = true
    setBusy(true); setError(false); setStatus('กำลังสร้างไฟล์ Excel')
    try {
      const data = await getData()
      await downloadExcel(data, filename)
      setStatus('ดาวน์โหลดไฟล์ Excel แล้ว')
    } catch (reason: unknown) {
      setError(true); setStatus(reason instanceof Error ? reason.message : 'ไม่สามารถส่งออกข้อมูลได้ กรุณาลองอีกครั้ง')
    } finally { pending.current = false; setBusy(false) }
  }
  return <div className="flex max-w-full shrink-0 flex-col items-end gap-1">
    <button type="button" title="Export Data" aria-label={`Export Data — ${title}`} aria-busy={busy} disabled={disabled || busy} onClick={() => void exportData()} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-default text-muted transition-colors duration-150 hover:bg-accent/10 hover:text-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50">
      <span aria-hidden="true">{busy ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="download" size={17} />}</span>
    </button>
    {error ? <span role="alert" className="max-w-48 text-xs text-danger">{status}</span> : <span className="sr-only" role="status" aria-live="polite">{status}</span>}
  </div>
}
