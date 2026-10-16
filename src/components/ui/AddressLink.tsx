'use client'

import { useState } from 'react'
import { Icon } from './Icon'

interface AddressLinkProps {
  address: string
  name: string | null
  tab?: 'tokens' | 'token_transfers'
}

function compactAddress(value: string): string {
  return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value
}

export function AddressLink({ address, name, tab = 'token_transfers' }: AddressLinkProps): React.JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')

  async function copyAddress(): Promise<void> {
    setCopyState('copying')
    try {
      await navigator.clipboard.writeText(address)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1600)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 2400)
    }
  }

  const isCopying = copyState === 'copying'
  const feedback = copyState === 'copied' ? 'Wallet address copied' : copyState === 'error' ? 'Unable to copy wallet address' : ''
  const title = copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : copyState === 'copying' ? 'Copying…' : 'Copy wallet address'
  const icon = copyState === 'copied' ? 'check' : copyState === 'error' ? 'alert' : 'copy'

  return <span className="inline-flex items-center gap-1"><a href={`https://www.kubscan.com/address/${encodeURIComponent(address)}?tab=${tab}`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent ${name ? 'font-medium' : 'font-mono'}`} title={name ? `${name} — ${address}` : address}><Icon name={name ? 'gear' : 'user'} size={12} />{name ?? compactAddress(address)}<Icon name="external" size={12} /></a><button type="button" onClick={() => void copyAddress()} disabled={isCopying} className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-subtle focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:cursor-wait disabled:opacity-60 ${copyState === 'error' ? 'text-danger' : 'text-faint hover:text-accent'}`} aria-label={`${title}: ${address}`} title={title}><Icon name={icon} size={12} /></button><span className="sr-only" aria-live="polite">{feedback}</span></span>
}
