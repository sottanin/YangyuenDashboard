'use client'

import Image from 'next/image'
import { useEffect, useId, useState } from 'react'

export interface VoucherActivityPoint {
  name: string
  purchase: number
  redeem: number
  tokenAddress: string
  tokenId: string
  imageUrl: string
}

interface VoucherActivityChartProps {
  data: VoucherActivityPoint[]
}

function compactLabel(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 13)}…`
}

export function VoucherActivityChart({ data }: VoucherActivityChartProps): React.JSX.Element {
  const tooltipId = useId()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const width = Math.max(760, data.length * 102)
  const height = 340
  const padLeft = 44
  const padRight = 16
  const padTop = 36
  const padBottom = 42
  const innerWidth = width - padLeft - padRight
  const innerHeight = height - padTop - padBottom
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.purchase, point.redeem]))
  const axisMax = Math.max(1, maxValue * 1.1)
  const bandWidth = innerWidth / data.length
  const groupWidth = Math.min(72, bandWidth * 0.64)
  const barWidth = groupWidth / 2
  const activePoint = activeIndex === null ? null : data[activeIndex]
  const yScale = (value: number): number => padTop + innerHeight - (value / axisMax) * innerHeight
  const ticks = Array.from({ length: 5 }, (_, index) => (axisMax / 4) * index)

  useEffect(() => {
    const hideTooltip = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setActiveIndex(null)
    }
    document.addEventListener('keydown', hideTooltip)
    return () => document.removeEventListener('keydown', hideTooltip)
  }, [])

  return <div className="relative">
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Chart legend">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Purchase (Mint)</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Redeem (Burn)</span>
    </div>
    <div className="overflow-x-auto thin-scroll" tabIndex={0} role="region" aria-label="NFT voucher purchase and redeem chart">
      <svg width={width} height={height} role="img" aria-label="NFT voucher activity grouped bar chart">
        {ticks.map((tick, index) => <g key={tick}>
          <line x1={padLeft} x2={width - padRight} y1={yScale(tick)} y2={yScale(tick)} stroke="rgb(var(--grid))" strokeDasharray="3 3" opacity={index === 0 ? 0.8 : 0.5} />
          <text x={padLeft - 8} y={yScale(tick) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text-faint))">{Math.round(tick).toLocaleString('en-US')}</text>
        </g>)}
        {data.map((point, index) => {
          const centerX = padLeft + bandWidth * index + bandWidth / 2
          const purchaseHeight = (point.purchase / axisMax) * innerHeight
          const redeemHeight = (point.redeem / axisMax) * innerHeight
          const isActive = activeIndex === index
          return <g
            key={`${point.tokenAddress}:${point.tokenId}:${point.name}`}
            tabIndex={0}
            role="button"
            aria-label={`${point.name}, Purchase ${point.purchase}, Redeem ${point.redeem}`}
            aria-describedby={isActive ? tooltipId : undefined}
            className="cursor-default outline-none focus-visible:[filter:drop-shadow(0_0_5px_rgb(var(--accent)))]"
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex(null)}
            onClick={() => setActiveIndex((current) => current === index ? null : index)}
          >
            <rect x={centerX - groupWidth / 2} y={yScale(point.purchase)} width={Math.max(4, barWidth - 2)} height={purchaseHeight} rx="4" className="fill-emerald-500" opacity={activeIndex !== null && !isActive ? 0.72 : 1} />
            <rect x={centerX - groupWidth / 2 + barWidth} y={yScale(point.redeem)} width={Math.max(4, barWidth - 2)} height={redeemHeight} rx="4" className="fill-rose-500" opacity={activeIndex !== null && !isActive ? 0.72 : 1} />
            <text x={centerX - groupWidth / 2 + (barWidth - 2) / 2} y={Math.max(14, yScale(point.purchase) - 6)} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="rgb(var(--text))">{point.purchase.toLocaleString('en-US')}</text>
            <text x={centerX - groupWidth / 2 + barWidth + (barWidth - 2) / 2} y={Math.max(14, yScale(point.redeem) - 6)} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="rgb(var(--text))">{point.redeem.toLocaleString('en-US')}</text>
            <text x={centerX} y={height - 12} textAnchor="middle" fontSize="10.5" fill="rgb(var(--text-faint))">{compactLabel(point.name)}</text>
          </g>
        })}
      </svg>
    </div>
    {activePoint ? <div id={tooltipId} role="tooltip" className="glass-strong pointer-events-none absolute right-3 top-9 z-40 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-default p-3 shadow-2xl">
      <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3">
        <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-default bg-surface">
          <Image src={failedImageUrl === activePoint.imageUrl ? '/token-default.svg' : activePoint.imageUrl} alt="" fill unoptimized sizes="48px" className="object-cover" onError={() => setFailedImageUrl(activePoint.imageUrl)} />
        </div>
        <p className="break-words text-sm font-semibold leading-5 text-default [overflow-wrap:anywhere]">{activePoint.name}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 p-2"><p className="text-[10px] font-medium text-emerald-300">Purchase (Mint)</p><p className="mt-0.5 text-base font-semibold tabular-nums text-default">{activePoint.purchase.toLocaleString('en-US')}</p></div>
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 p-2"><p className="text-[10px] font-medium text-rose-300">Redeem (Burn)</p><p className="mt-0.5 text-base font-semibold tabular-nums text-default">{activePoint.redeem.toLocaleString('en-US')}</p></div>
      </div>
    </div> : null}
  </div>
}
