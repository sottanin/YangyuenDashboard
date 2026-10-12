'use client'

import { useState } from 'react'
import Image from 'next/image'

interface TokenAvatarProps {
  src?: string | null
  symbol: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-10 w-10' } as const

export function TokenAvatar({ src, symbol, size = 'md', className = '' }: TokenAvatarProps): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  return <Image
    src={!failed && src ? src : '/token-default.svg'}
    alt={`${symbol} token`}
    width={40}
    height={40}
    unoptimized
    className={`${sizes[size]} shrink-0 rounded-full object-cover ring-1 ring-white/10 ${className}`}
    onError={() => setFailed(true)}
  />
}
