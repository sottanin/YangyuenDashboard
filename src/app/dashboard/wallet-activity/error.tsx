'use client'

import { ErrorCard } from '@/components/ui/ErrorCard'

export default function Error({ reset }: { reset: () => void }): React.JSX.Element {
  return <ErrorCard message="Unable to open Wallet Activity Report" onRetry={reset} />
}
