'use client'
export default function ErrorPage({ reset }: { error: Error; reset: () => void }): React.JSX.Element { return <div className="rounded-2xl border border-red-400/30 p-6 text-red-400">Unable to load KAP-20 Analysis.<button className="btn btn-ghost ml-3" onClick={reset}>Retry</button></div> }
