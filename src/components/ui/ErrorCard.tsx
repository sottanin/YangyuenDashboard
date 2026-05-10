'use client'

import { Icon } from './Icon'

interface ErrorCardProps {
  message?: string
  onRetry?: () => void
}

export function ErrorCard({ message = 'Failed to load data', onRetry }: ErrorCardProps) {
  return (
    <div className="glass rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: 'rgb(var(--danger) / 0.12)' }}>
        <Icon name="alert" size={18} className="text-danger" />
      </div>
      <div>
        <div className="text-sm font-medium text-default">{message}</div>
        <div className="text-xs text-muted mt-1">Check your connection or database status</div>
      </div>
      {onRetry && (
        <button className="btn btn-ghost mt-1" onClick={onRetry}>
          <Icon name="refresh" size={13} /> Retry
        </button>
      )}
    </div>
  )
}
