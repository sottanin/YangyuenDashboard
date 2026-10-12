'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Sparkline } from '@/components/charts/Sparkline'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { Icon } from '@/components/ui/Icon'
import Image from 'next/image'
import { useWorkspace } from '@/lib/WorkspaceContext'

interface TokenData {
  id: string
  name: string
  address: string
  transferCount: number
}

interface NFTInstance {
  id: string
  name: string
  imageUrl: string | null
  ownerHash: string
  tokenAddress: string
  tokenValue: string | null
  visible: boolean
}

const TOKEN_COLORS: Record<string, string> = {
  'ICC-YANGYUEN': 'rgb(99 102 241)',
  'Green': 'rgb(6 182 212)',
  'Together': 'rgb(139 92 246)',
  'Integrity': 'rgb(16 185 129)',
  'Fit': 'rgb(245 158 11)',
}

const TOKEN_BG: Record<string, string> = {
  'ICC-YANGYUEN': 'rgb(99 102 241 / 0.12)',
  'Green': 'rgb(6 182 212 / 0.12)',
  'Together': 'rgb(139 92 246 / 0.12)',
  'Integrity': 'rgb(16 185 129 / 0.12)',
  'Fit': 'rgb(245 158 11 / 0.12)',
}

// Pseudo-random sparklines per token
const SPARKS: Record<string, number[]> = {
  'ICC-YANGYUEN': [20,25,22,30,28,35,40,38,42,45,48,52],
  'Green': [10,12,11,14,16,15,18,20,19,22,24,26],
  'Together': [5,6,5,8,7,9,10,9,11,12,13,15],
  'Integrity': [8,9,10,8,11,10,12,14,13,15,16,18],
  'Fit': [3,4,3,5,4,6,5,7,6,8,9,10],
}

function trunc(s: string, n = 16) {
  if (!s || s.length <= n) return s
  return s.slice(0, 8) + '...' + s.slice(-6)
}

const TRUSTED_NFT_IMAGE_HOSTS = new Set(['ipfs.io', 'gateway.pinata.cloud', 'cloudflare-ipfs.com'])

function safeNftImageUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null
  const candidate = rawUrl.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${rawUrl.slice(7)}` : rawUrl
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && TRUSTED_NFT_IMAGE_HOSTS.has(url.hostname.toLowerCase()) ? url.toString() : null
  } catch {
    return null
  }
}

function NftImage({ nft }: { nft: NFTInstance }) {
  const [failed, setFailed] = useState(false)
  const imageUrl = safeNftImageUrl(nft.imageUrl)

  if (!imageUrl || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted" role="img" aria-label={`${nft.name} image unavailable`}>
        <span className="text-4xl" aria-hidden="true">🍱</span>
        {failed && <span className="text-[10px]">Image unavailable</span>}
      </div>
    )
  }

  return (
    <Image
      src={imageUrl}
      alt={nft.name}
      fill
      unoptimized
      sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      className="object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export default function TokensPage() {
  const { selected, loading: workspaceLoading } = useWorkspace()
  const [tokens, setTokens] = useState<TokenData[]>([])
  const [nftInstances, setNftInstances] = useState<NFTInstance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (workspaceLoading) return
    const controller = new AbortController()
    fetch(`/api/tokens?workspace=${encodeURIComponent(String(selected.id))}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load tokens')
        return r.json()
      })
      .then((data) => {
        setTokens(data.tokens || [])
        setNftInstances(data.nftInstances || [])
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [selected.id, workspaceLoading])

  const tokenNames = ['ICC-YANGYUEN', 'Green', 'Together', 'Integrity', 'Fit']

  return (
    <>
      <PageHeader
        title="Tokens"
        subtitle="KAP-20/KAP-22 loyalty tokens and KAP-721 redemption instances"
        actions={
          <button className="btn btn-ghost"><Icon name="refresh" size={14} />Refresh</button>
        }
      />

      {/* KAP-20/KAP-22 Token Cards */}
      <div className="mb-2">
        <div className="text-xs font-medium text-muted uppercase tracking-wider mb-3">KAP-20 / KAP-22 Tokens</div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {tokenNames.map((n) => <SkeletonCard key={n} height={160} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {tokenNames.map((name) => {
            const token = tokens.find((t) => t.name === name)
            const color = TOKEN_COLORS[name] || 'rgb(var(--accent))'
            const bg = TOKEN_BG[name] || 'rgb(var(--accent) / 0.12)'
            const sparks = SPARKS[name] || [1, 2, 3, 4, 5]
            return (
              <div key={name} className="glass rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: bg, color }}>
                    <Icon name="box" size={16} />
                  </div>
                  <span className="pill pill-muted text-[10px]">ERC-20</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-default truncate">{name}</div>
                  <div className="text-[10px] font-mono text-faint mt-0.5 truncate">
                    {token ? trunc(token.address) : '—'}
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-semibold tracking-tight text-default">
                      {token ? token.transferCount.toLocaleString() : '0'}
                    </div>
                    <div className="text-[10px] text-muted">transfers</div>
                  </div>
                  <Sparkline values={sparks} color={color} width={70} height={32} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* NFT Section */}
      <div className="mb-2">
        <div className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          KAP-721 NFT Instances
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} height={200} />)}
        </div>
      ) : nftInstances.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl mb-3">🖼️</div>
            <div className="text-sm font-medium text-default">No NFT instances found</div>
            <div className="text-xs text-muted mt-1">Seed the database to see NFT redemption data</div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {nftInstances.map((nft) => (
            <div key={`${nft.tokenAddress}:${nft.id}`} className="glass rounded-2xl overflow-hidden">
              <div
                className="relative w-full h-32 flex items-center justify-center"
                style={{ background: 'rgb(var(--surface-2))' }}
              >
                <NftImage nft={nft} />
              </div>
              <div className="p-4">
                <div className="text-sm font-medium text-default truncate">{nft.name}</div>
                <div className="text-[10px] font-mono text-faint mt-1 truncate">{trunc(nft.ownerHash)}</div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-muted">ID: {nft.id}</span>
                  <span className={`pill ${nft.visible ? 'pill-success' : 'pill-muted'}`}>
                    {nft.visible ? 'Visible' : 'Hidden'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
