'use client'

import { useState, useEffect } from 'react'
import { resolveColor } from './chartUtils'

export function useResolvedColors(colors: string[]): string[] {
  const [, force] = useState(0)

  useEffect(() => {
    const obs = new MutationObserver(() => force((n) => n + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  return colors.map(resolveColor)
}
