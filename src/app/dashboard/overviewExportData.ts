import type { TransactionTimelineGranularity, TransactionTimelinePoint } from '@/components/charts/TransactionTimelineChart'
import type { ExcelExportData } from '@/lib/reporting/exportExcel'

interface TimelineExportSource {
  monthly: TransactionTimelinePoint[]
  daily: TransactionTimelinePoint[]
}

export function overviewTimelineExport(timeline: TimelineExportSource, granularity: TransactionTimelineGranularity): ExcelExportData {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: granularity === 'monthly' ? undefined : 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return {
    headers: ['ช่วงเวลา', 'Transactions'],
    rows: timeline[granularity].map((point) => [
      formatter.format(new Date(`${point.label}${granularity === 'monthly' ? '-01' : ''}T00:00:00Z`)),
      point.value,
    ]),
  }
}
