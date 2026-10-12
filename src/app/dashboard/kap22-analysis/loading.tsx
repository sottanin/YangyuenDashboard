import { SkeletonCard, SkeletonKpi } from '@/components/ui/SkeletonCard'

export default function Loading() {
  return <div className="space-y-4"><div className="shimmer h-16 rounded-xl" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((key) => <SkeletonKpi key={key} />)}</div><SkeletonCard height={360} /><SkeletonCard height={420} /></div>
}
