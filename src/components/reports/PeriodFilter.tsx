'use client'

import type { ReportPeriod } from '@/lib/reporting/reportPeriod'

interface Props {
  idPrefix: string
  period: ReportPeriod
  customFrom: string
  customTo: string
  minDate?: string
  maxDate: string
  disabled?: boolean
  onPeriodChange: (value: ReportPeriod) => void
  onCustomFromChange: (value: string) => void
  onCustomToChange: (value: string) => void
}

export function PeriodFilter(props: Props): React.JSX.Element {
  return <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-end sm:justify-end">
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted sm:w-44" htmlFor={`${props.idPrefix}-period`}>Period
      <select id={`${props.idPrefix}-period`} className="input min-h-11" disabled={props.disabled} value={props.period} onChange={(event) => props.onPeriodChange(event.target.value as ReportPeriod)}>
        <option value="all">All-time</option><option value="week">1 Week</option><option value="month">1 Month</option><option value="3months">3 Months</option><option value="year">1 Year</option><option value="custom">Select date</option>
      </select>
    </label>
    {props.period === 'custom' ? <div className="flex min-w-0 items-end gap-2 sm:w-auto"><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted" htmlFor={`${props.idPrefix}-from`}>From<input id={`${props.idPrefix}-from`} type="date" className="input min-h-11 min-w-0" min={props.minDate} max={props.maxDate} value={props.customFrom} onChange={(event) => props.onCustomFromChange(event.target.value)} /></label><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted" htmlFor={`${props.idPrefix}-to`}>To<input id={`${props.idPrefix}-to`} type="date" className="input min-h-11 min-w-0" min={props.minDate} max={props.maxDate} value={props.customTo} onChange={(event) => props.onCustomToChange(event.target.value)} /></label></div> : null}
  </div>
}
