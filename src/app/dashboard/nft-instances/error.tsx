'use client'

import { ErrorCard } from '@/components/ui/ErrorCard'

export default function Error({ reset }: { error: Error; reset: () => void }): React.JSX.Element {
  return <ErrorCard message="Unable to open NFT Instances" onRetry={reset} />
}
