'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { TokenAvatar } from '@/components/ui/TokenAvatar'
import type { ReportPeriod } from '@/lib/reporting/reportPeriod'

export interface ReportTokenOption { id: string; name: string; symbol: string; address: string; imageUrl: string | null }

interface Props {
  idPrefix: string
  tokens: ReportTokenOption[]
  token: string
  period: ReportPeriod
  customFrom: string
  customTo: string
  disabled?: boolean
  minDate?: string
  maxDate: string
  onTokenChange: (value: string) => void
  onPeriodChange: (value: ReportPeriod) => void
  onCustomFromChange: (value: string) => void
  onCustomToChange: (value: string) => void
}

function cleanTokenName(name: string, symbol: string): string {
  const suffix = ` (${symbol})`
  return name.toLowerCase().endsWith(suffix.toLowerCase()) ? name.slice(0, -suffix.length).trim() : name
}

export function ReportFilters(props: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedIndex = Math.max(0, props.tokens.findIndex((item) => item.address.toLowerCase() === props.token.toLowerCase()))
  const selected = props.tokens[selectedIndex]
  useEffect(() => {
    function close(event: MouseEvent): void { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  function choose(index: number): void { const option = props.tokens[index]; if (!option) return; props.onTokenChange(option.address); setActiveIndex(index); setOpen(false) }
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setOpen(true); setActiveIndex(event.key === 'Home' ? 0 : Math.max(0, props.tokens.length - 1)); return }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(activeIndex); else { setActiveIndex(selectedIndex); setOpen(true) }; return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex((current) => event.key === 'ArrowDown' ? Math.min(props.tokens.length - 1, current + 1) : Math.max(0, current - 1)) }
  }
  return <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
    <div ref={rootRef} className="relative flex min-w-0 flex-col gap-1 text-xs font-medium text-muted sm:w-64">
      <span id={`${props.idPrefix}-token-label`}>Point Token</span>
      <button type="button" className="input flex min-h-11 w-full items-center gap-2 text-left" aria-labelledby={`${props.idPrefix}-token-label ${props.idPrefix}-token-value`} aria-haspopup="listbox" aria-expanded={open} disabled={props.disabled || props.tokens.length === 0} onClick={() => { if (!open) setActiveIndex(selectedIndex); setOpen((value) => !value) }} onKeyDown={handleKeyDown}>
        {selected ? <><TokenAvatar src={selected.imageUrl} symbol={selected.symbol} size="sm" /><span id={`${props.idPrefix}-token-value`} className="min-w-0 flex-1 truncate text-default">{cleanTokenName(selected.name, selected.symbol)}</span><span className="font-mono text-[11px] text-muted">{selected.symbol}</span></> : <span id={`${props.idPrefix}-token-value`} className="flex-1">No active KAP-20 tokens</span>}
        <Icon name="chevR" size={12} className={`shrink-0 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open ? <ul role="listbox" aria-labelledby={`${props.idPrefix}-token-label`} className="glass-strong absolute left-0 top-full z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-default p-1 shadow-xl thin-scroll">{props.tokens.map((item, index) => <li key={item.address} role="option" aria-selected={item.address.toLowerCase() === props.token.toLowerCase()} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 ${index === activeIndex ? 'bg-white/10 text-default' : 'text-muted hover:bg-white/5 hover:text-default'}`} onMouseEnter={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}><TokenAvatar src={item.imageUrl} symbol={item.symbol} size="sm" /><span className="min-w-0 flex-1 truncate">{cleanTokenName(item.name, item.symbol)}</span><span className="font-mono text-[11px]">{item.symbol}</span></li>)}</ul> : null}
    </div>
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted sm:w-36" htmlFor={`${props.idPrefix}-period`}>Period
      <select id={`${props.idPrefix}-period`} className="input min-h-11" value={props.period} onChange={(event) => props.onPeriodChange(event.target.value as ReportPeriod)}>
        <option value="all">All-time</option><option value="week">1 Week</option><option value="month">1 Month</option><option value="3months">3 Months</option><option value="year">1 Year</option><option value="custom">Select date</option>
      </select>
    </label>
    {props.period === 'custom' ? <div className="flex min-w-0 items-end gap-2 sm:w-auto"><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted" htmlFor={`${props.idPrefix}-from`}>From<input id={`${props.idPrefix}-from`} type="date" className="input min-h-11 min-w-0" min={props.minDate} max={props.maxDate} value={props.customFrom} onChange={(event) => props.onCustomFromChange(event.target.value)} /></label><label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted" htmlFor={`${props.idPrefix}-to`}>To<input id={`${props.idPrefix}-to`} type="date" className="input min-h-11 min-w-0" min={props.minDate} max={props.maxDate} value={props.customTo} onChange={(event) => props.onCustomToChange(event.target.value)} /></label></div> : null}
  </div>
}
