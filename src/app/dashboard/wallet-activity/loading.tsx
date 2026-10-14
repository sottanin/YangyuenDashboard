import { SkeletonKpi, SkeletonTable } from '@/components/ui/SkeletonCard'

export default function Loading(): React.JSX.Element {
  return <div className="space-y-4"><div className="h-32 shimmer rounded-2xl" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 7 }, (_, index) => <SkeletonKpi key={index} />)}</div><div className="glass rounded-2xl p-5"><SkeletonTable rows={7} /></div></div>
}
