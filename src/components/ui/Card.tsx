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
    <div className={`glass rounded-2xl ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${noPad ? 'px-5 pt-5' : 'px-5 pt-5 pb-2'}`}>
          <div>
            {title && <div className="text-sm font-semibold text-default">{title}</div>}
            {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={noPad ? '' : 'p-5'}>{children}</div>
    </div>
  )
}
