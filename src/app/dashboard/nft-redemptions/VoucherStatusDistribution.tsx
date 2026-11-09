interface VoucherStatusDistributionProps {
  active: number
  used: number
}

export function VoucherStatusDistribution({ active, used }: VoucherStatusDistributionProps): React.JSX.Element {
  const total = active + used
  const activePercent = total > 0 ? active / total * 100 : 0
  const series = [
    { label: 'ยังอยู่กับผู้ใช้', value: active, percent: activePercent, color: 'bg-[rgb(var(--accent))]', text: 'text-slate-950' },
    { label: 'ใช้แล้ว', value: used, percent: total > 0 ? 100 - activePercent : 0, color: 'bg-[rgb(var(--accent-3))]', text: 'text-slate-950' },
  ]
  const formatPercent = (value: number): string => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`

  return <figure aria-label="สัดส่วนสถานะ voucher ที่ทราบสถานะ">
    {total > 0 ? <div className="flex h-12 w-full overflow-hidden rounded-xl bg-surface-2" aria-hidden="true">
      {series.filter((item) => item.value > 0).map((item) => <div key={item.label} className={`@container flex min-w-0 items-center justify-center ${item.color} ${item.text}`} style={{ width: `${item.percent}%` }} title={`${item.label}: ${item.value.toLocaleString()} (${formatPercent(item.percent)})`}>
        <span className="hidden whitespace-nowrap text-xs font-semibold tabular-nums @min-[3rem]:inline">{formatPercent(item.percent)}</span>
      </div>)}
    </div> : <div className="flex min-h-12 items-center justify-center rounded-xl bg-surface-2 px-3 text-center text-sm text-muted">ยังไม่มี voucher ที่ทราบสถานะ</div>}
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-sm">
      {series.map((item) => <li key={item.label} className="flex min-w-0 items-center gap-2"><span className={`h-3 w-3 shrink-0 rounded-full ${item.color}`} aria-hidden="true" /><span className="text-default">{item.label}: <span className="font-mono font-medium">{item.value.toLocaleString()}</span> <span className="text-muted">({formatPercent(item.percent)})</span></span></li>)}
    </ul>
    <p className="text-xs text-muted">Total <span className="font-mono font-medium text-default">{total.toLocaleString()}</span></p>
    </div>
    <p className="mt-3 text-xs text-muted">ยอดรวมและสัดส่วนคำนวณเฉพาะ voucher ที่ยังอยู่กับผู้ใช้และใช้แล้ว</p>
  </figure>
}
