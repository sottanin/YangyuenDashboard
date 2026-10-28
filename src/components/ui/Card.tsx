import { ReactNode } from 'react'

interface CardProps {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  noPad?: boolean
}

export function Card({ title, subtitle, action, children, className = '', noPad }: CardProps) {
  return (
    <div className={`glass min-w-0 max-w-full overflow-hidden rounded-2xl ${className}`}>
      {(title || action) && (
        <div className={`flex min-w-0 flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center has-[[data-chart-expand-control]]:flex-row has-[[data-chart-expand-control]]:items-start ${noPad ? 'px-5 pt-5' : 'px-5 pt-5 pb-2'}`}>
          <div className="min-w-0 flex-1">
            {title && <div data-chart-title className="text-sm font-semibold text-default">{title}</div>}
            {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
          </div>
          {action}
          <div data-chart-header-actions className="ml-auto flex shrink-0 items-start empty:hidden" />
        </div>
      )}
      <div className={noPad ? 'min-w-0 max-w-full' : 'min-w-0 max-w-full p-5'}>{children}</div>
    </div>
  )
}
