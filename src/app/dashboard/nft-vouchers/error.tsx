'use client'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }): React.JSX.Element {
  return <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-red-400/30 px-6 text-center"><h1 className="text-lg font-semibold text-default">Unable to open NFT Vouchers</h1><p className="mt-2 text-sm text-muted">Check your connection or database status.</p><button type="button" className="btn btn-primary mt-5 min-h-11" onClick={reset}>Try again</button></div>
}
