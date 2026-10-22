export default function Loading(): React.JSX.Element {
  return <div className="space-y-4" aria-label="Loading NFT vouchers"><div className="h-20 shimmer rounded-2xl" /><div className="h-[400px] shimmer rounded-2xl" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <div key={index} className="aspect-[3/4] shimmer rounded-2xl" />)}</div></div>
}
