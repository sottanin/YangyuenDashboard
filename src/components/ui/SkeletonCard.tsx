export function SkeletonCard({ height = 200 }: { height?: number }) {
  return (
    <div className="glass rounded-2xl p-5 overflow-hidden" style={{ height }}>
      <div className="shimmer h-4 w-1/3 rounded-lg mb-3" />
      <div className="shimmer h-8 w-1/2 rounded-lg mb-4" />
      <div className="shimmer h-full rounded-lg" style={{ height: height - 80 }} />
    </div>
  )
}

export function SkeletonKpi() {
  return (
    <div className="glass rounded-2xl p-5 overflow-hidden">
      <div className="shimmer h-3 w-1/2 rounded mb-3" />
      <div className="shimmer h-8 w-2/3 rounded mb-4" />
      <div className="shimmer h-6 w-1/4 rounded" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-default last:border-0">
            <div className="shimmer w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="shimmer h-3 w-2/3 rounded" />
              <div className="shimmer h-2.5 w-1/3 rounded" />
            </div>
            <div className="shimmer h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
