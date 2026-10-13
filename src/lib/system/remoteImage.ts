import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ALLOWED_REMOTE_HOSTS = new Set(['bitkubipfs.io', 'ipfs.io'])
const CACHE_TTL_MS = 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 32
const MAX_CONCURRENT_FETCHES = 4

interface CacheEntry {
  expiresAt: number
  image: RemoteImage
}

const imageCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<RemoteImage | null>>()
const slotWaiters: Array<() => void> = []
let activeFetches = 0

function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
}

function isBlockedAddress(address: string): boolean {
  if (isIP(address) === 4) return isBlockedIpv4(address)
  const normalized = address.toLowerCase()
  if (isIP(normalized) !== 6) return true
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  return mapped ? isBlockedIpv4(mapped) : false
}

function normalizeRemoteUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim()
  const ipfsMatch = trimmed.match(/^ipfs:\/\/(?:ipfs\/)?([^?#]+)(.*)$/i)
  const candidate = ipfsMatch ? `https://ipfs.io/ipfs/${ipfsMatch[1]}${ipfsMatch[2]}` : trimmed
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !ALLOWED_REMOTE_HOSTS.has(url.hostname.toLowerCase())) return null
    return url
  } catch {
    return null
  }
}

async function validatePublicHost(url: URL): Promise<boolean> {
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false
  if (isIP(hostname)) return !isBlockedAddress(hostname)
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    return addresses.length > 0 && addresses.every((entry) => !isBlockedAddress(entry.address))
  } catch {
    return false
  }
}

export interface RemoteImage {
  bytes: Uint8Array
  contentType: string
}

async function acquireFetchSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) { activeFetches += 1; return }
  await new Promise<void>((resolve) => slotWaiters.push(resolve))
}

function releaseFetchSlot(): void {
  const next = slotWaiters.shift()
  if (next) next()
  else activeFetches = Math.max(0, activeFetches - 1)
}

function cacheImage(key: string, image: RemoteImage): void {
  imageCache.delete(key)
  imageCache.set(key, { image, expiresAt: Date.now() + CACHE_TTL_MS })
  while (imageCache.size > MAX_CACHE_ENTRIES) {
    const oldest = imageCache.keys().next().value as string | undefined
    if (!oldest) break
    imageCache.delete(oldest)
  }
}

function detectedType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(new TextDecoder().decode(bytes.slice(0, 6)))) return 'image/gif'
  return null
}

async function fetchRemoteImageUncached(initialUrl: URL): Promise<RemoteImage | null> {
  let current = initialUrl
  await acquireFetchSlot()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      if (!await validatePublicHost(current)) return null
      const response = await fetch(current, {
        headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' },
        redirect: 'manual',
        signal: controller.signal,
        cache: 'no-store',
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location || redirect === MAX_REDIRECTS) return null
        const redirected = normalizeRemoteUrl(new URL(location, current).toString())
        if (!redirected) return null
        current = redirected
        continue
      }
      if (!response.ok || !response.body) return null
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) return null
      const declaredSize = Number(response.headers.get('content-length') ?? '0')
      if (declaredSize > MAX_IMAGE_BYTES) return null
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_IMAGE_BYTES) { await reader.cancel(); return null }
        chunks.push(value)
      }
      const bytes = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      const actualType = detectedType(bytes)
      if (!actualType || actualType !== contentType) return null
      return { bytes, contentType: actualType }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
    releaseFetchSlot()
  }
}

export async function fetchRemoteImage(rawUrl: string): Promise<RemoteImage | null> {
  const normalized = normalizeRemoteUrl(rawUrl)
  if (!normalized) return null
  const key = normalized.toString()
  const cached = imageCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    imageCache.delete(key)
    imageCache.set(key, cached)
    return cached.image
  }
  if (cached) imageCache.delete(key)
  const pending = inFlight.get(key)
  if (pending) return pending
  const request = fetchRemoteImageUncached(normalized)
    .then((image) => { if (image) cacheImage(key, image); return image })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, request)
  return request
}
