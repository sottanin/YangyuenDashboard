import { SkeletonTable } from '@/components/ui/SkeletonCard'

export default function Loading(): React.JSX.Element {
  return <div><div className="mb-6"><div className="shimmer h-8 w-48 rounded" /><div className="shimmer mt-2 h-4 w-96 max-w-full rounded" /></div><SkeletonTable rows={8} /></div>
}
