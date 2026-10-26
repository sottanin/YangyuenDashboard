import { Icon } from './Icon'

interface ComparisonTagProps { change?: number | null; label?: string }

export function ComparisonTag({ change, label }: ComparisonTagProps): React.JSX.Element | null {
  if (change == null) return label ? <span className="text-xs text-muted">{label}</span> : null
  const tone = change === 0 ? 'pill-muted' : change > 0 ? 'pill-success' : 'pill-danger'
  return <span className={`pill ${tone} max-w-full flex-wrap`} title={label}>
    {change !== 0 ? <Icon name={change > 0 ? 'arrowUp' : 'arrowDown'} size={10} strokeWidth={2.5} /> : null}
    <span>{change > 0 ? '+' : ''}{change}%</span>
    {label ? <span className="ml-1 normal-case">{label}</span> : null}
  </span>
}
