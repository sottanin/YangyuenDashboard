'use client'

import { ErrorCard } from '@/components/ui/ErrorCard'

export default function Error({ reset }: { reset: () => void }) {
  return <ErrorCard message="Unable to open KAP-22 Analysis" onRetry={reset} />
}
