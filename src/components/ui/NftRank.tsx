import { Icon } from './Icon'

export function NftRank({ index }: { index: number }): React.JSX.Element {
  if (index > 2) return <span className="w-7 shrink-0 text-center text-xs text-faint">#{index + 1}</span>
  const color = index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-300' : 'text-amber-700'
  return <span className={`flex w-7 shrink-0 justify-center ${color}`} aria-label={`Rank ${index + 1}`}><Icon name="target" size={17} /></span>
}
