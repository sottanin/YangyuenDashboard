import { Prisma } from '@prisma/client'
import { isValidAddress, normalizeAddress } from '@/lib/system/addresses'

const KUB_MAINNET_RPC_URL = 'https://rpc.bitkubchain.io'
const TOKEN_URI_SELECTOR = 'c87b56dd'
const OWNER_OF_SELECTOR = '6352211e'
const RPC_TIMEOUT_MS = 15_000
const METADATA_TIMEOUT_MS = 20_000
const MAX_RPC_RESPONSE_BYTES = 64_000
const MAX_METADATA_RESPONSE_BYTES = 1_000_000
const MAX_REDIRECTS = 3
const MAX_ATTEMPTS = 3
const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1)
const ALLOWED_METADATA_HOSTS = new Set(['bitkubipfs.io', 'ipfs.io', 'dweb.link', 'gateway.pinata.cloud', 'nftstorage.link'])

interface JsonRpcResponse { jsonrpc?: unknown; id?: unknown; result?: unknown; error?: unknown }
interface NFTAttribute { trait_type?: unknown; value?: unknown }
interface NFTMetadata {
  imageTH?: unknown
  image_th?: unknown
  nameTH?: unknown
  name_th?: unknown
  attributes?: unknown
}

export interface NFTContractInstance {
  ownerHash: string
  imageUrl: string | null
  name: string
  tokenValue: Prisma.Decimal | null
  type: string | null
  detailTH: string | null
  conditionTH: string | null
  category: string | null
  availableDate: Date | null
  expiredDate: Date | null
}

export interface NFTContractReference {
  tokenURI: string
  ownerHash: string
}

class TransientRpcError extends Error {}

function encodedTokenId(tokenId: string): string {
  const trimmed = tokenId.trim()
  if (!/^\d+$/.test(trimmed)) throw new Error('NFT token ID must be an unsigned decimal integer')
  const value = BigInt(trimmed)
  if (value > UINT256_MAX) throw new Error('NFT token ID exceeds uint256')
  return value.toString(16).padStart(64, '0')
}

async function readLimitedBody(response: Response, maximumBytes: number, label: string): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const size = Number(contentLength)
    if (Number.isFinite(size) && size > maximumBytes) throw new Error(`${label} response is too large`)
  }
  if (!response.body) throw new Error(`${label} returned an empty response body`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytesRead += chunk.value.byteLength
    if (bytesRead > maximumBytes) {
      await reader.cancel()
      throw new Error(`${label} response is too large`)
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  return body + decoder.decode()
}

function decodeAbiString(value: string): string {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || (value.length - 2) % 2 !== 0) throw new Error('tokenURI returned invalid ABI data')
  const hex = value.slice(2)
  if (hex.length < 128) throw new Error('tokenURI returned incomplete ABI data')
  const offset = Number(BigInt(`0x${hex.slice(0, 64)}`)) * 2
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 64 > hex.length) throw new Error('tokenURI returned an invalid ABI offset')
  const byteLength = Number(BigInt(`0x${hex.slice(offset, offset + 64)}`))
  const start = offset + 64
  const end = start + byteLength * 2
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || end > hex.length) throw new Error('tokenURI returned an invalid ABI length')
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(hex.slice(start, end), 'hex'))
}

function decodeOwner(value: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('ownerOf returned invalid ABI data')
  return `0x${value.slice(-40)}`
}

async function requestContractData(contractAddress: string, tokenId: string): Promise<NFTContractReference> {
  const argument = encodedTokenId(tokenId)
  const payload = [
    { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contractAddress, data: `0x${TOKEN_URI_SELECTOR}${argument}` }, 'latest'] },
    { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: contractAddress, data: `0x${OWNER_OF_SELECTOR}${argument}` }, 'latest'] },
  ]
  const response = await fetch(KUB_MAINNET_RPC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS), cache: 'no-store',
  })
  if (response.status === 429 || response.status >= 500) throw new TransientRpcError(`KUB RPC returned HTTP ${response.status}`)
  if (!response.ok) throw new Error(`KUB RPC returned HTTP ${response.status}`)
  const parsed: unknown = JSON.parse(await readLimitedBody(response, MAX_RPC_RESPONSE_BYTES, 'KUB RPC'))
  if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error('KUB RPC returned an incomplete NFT batch response')
  const byId = new Map<number, JsonRpcResponse>()
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('KUB RPC returned invalid JSON-RPC data')
    const rpc = item as JsonRpcResponse
    if ((rpc.id !== 1 && rpc.id !== 2) || byId.has(rpc.id)) throw new Error('KUB RPC returned an invalid response id')
    byId.set(rpc.id, rpc)
  }
  const tokenURI = byId.get(1)
  const owner = byId.get(2)
  if (!tokenURI || tokenURI.jsonrpc !== '2.0' || tokenURI.error !== undefined || typeof tokenURI.result !== 'string') throw new Error('tokenURI contract call failed')
  if (!owner || owner.jsonrpc !== '2.0' || owner.error !== undefined || typeof owner.result !== 'string') throw new Error('ownerOf contract call failed')
  return { tokenURI: decodeAbiString(tokenURI.result), ownerHash: decodeOwner(owner.result) }
}

function metadataUrl(uri: string): URL {
  const trimmed = uri.trim()
  const ipfsMatch = trimmed.match(/^ipfs:\/\/(?:ipfs\/)?([^/?#]+)(.*)$/i)
  const url = new URL(ipfsMatch ? `https://bitkubipfs.io/ipfs/${ipfsMatch[1]}${ipfsMatch[2]}` : trimmed)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !ALLOWED_METADATA_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('tokenURI metadata URL is not allowed')
  }
  return url
}

async function fetchMetadataUrl(initialUrl: URL): Promise<NFTMetadata> {
  let url = initialUrl
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(METADATA_TIMEOUT_MS), cache: 'no-store', redirect: 'manual',
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || redirect === MAX_REDIRECTS) throw new Error('NFT metadata redirected too many times')
      url = metadataUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) throw new Error(`NFT metadata returned HTTP ${response.status}`)
    const parsed: unknown = JSON.parse(await readLimitedBody(response, MAX_METADATA_RESPONSE_BYTES, 'NFT metadata'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('NFT metadata must be a JSON object')
    return parsed as NFTMetadata
  }
  throw new Error('NFT metadata redirect loop ended unexpectedly')
}

async function readMetadata(uri: string): Promise<NFTMetadata> {
  const trimmed = uri.trim()
  let parsed: unknown
  if (trimmed.startsWith('{')) parsed = JSON.parse(trimmed)
  else if (trimmed.startsWith('data:application/json;base64,')) {
    const encoded = trimmed.slice('data:application/json;base64,'.length)
    if (encoded.length > MAX_METADATA_RESPONSE_BYTES * 2) throw new Error('NFT metadata response is too large')
    parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  } else if (trimmed.startsWith('data:application/json,')) {
    if (trimmed.length > MAX_METADATA_RESPONSE_BYTES * 3) throw new Error('NFT metadata response is too large')
    parsed = JSON.parse(decodeURIComponent(trimmed.slice('data:application/json,'.length)))
  } else return fetchMetadataUrl(metadataUrl(trimmed))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('tokenURI metadata must be a JSON object')
  return parsed as NFTMetadata
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

function attributeMap(metadata: NFTMetadata): Map<string, unknown> {
  const map = new Map<string, unknown>()
  if (!Array.isArray(metadata.attributes)) return map
  for (const item of metadata.attributes) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const attribute = item as NFTAttribute
    const key = textValue(attribute.trait_type)?.toLowerCase()
    if (key) map.set(key, attribute.value)
  }
  return map
}

function decimalFromWei(value: unknown): Prisma.Decimal | null {
  const raw = textValue(value)
  if (raw === null || !/^\d+$/.test(raw)) return null
  const padded = raw.padStart(19, '0')
  const integer = padded.slice(0, -18)
  const fraction = padded.slice(-18).replace(/0+$/, '')
  return new Prisma.Decimal(fraction ? `${integer}.${fraction}` : integer)
}

function dateFromMetadata(value: unknown): Date | null {
  const raw = textValue(value)
  if (raw === null) return null
  let date: Date
  if (/^\d+$/.test(raw)) {
    const numeric = BigInt(raw)
    const milliseconds = numeric < BigInt('100000000000') ? numeric * BigInt(1000) : numeric
    if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('NFT metadata date is outside the supported range')
    date = new Date(Number(milliseconds))
  } else date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw new Error('NFT metadata contains an invalid date')
  return date
}

function shouldRetry(error: unknown): boolean {
  return error instanceof TransientRpcError || (error instanceof DOMException && error.name === 'TimeoutError') || error instanceof TypeError
}

export async function readNFTContractReference(contractAddress: string, tokenId: string): Promise<NFTContractReference> {
  if (!isValidAddress(contractAddress)) throw new Error('Invalid NFT contract address')
  const normalizedAddress = normalizeAddress(contractAddress)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestContractData(normalizedAddress, tokenId)
    } catch (error) {
      if (!shouldRetry(error) || attempt === MAX_ATTEMPTS) throw error
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250))
    }
  }
  throw new Error('NFT contract retry loop ended unexpectedly')
}

export async function readNFTMetadataInstance(reference: NFTContractReference): Promise<NFTContractInstance> {
  const metadata = await readMetadata(reference.tokenURI)
  const attributes = attributeMap(metadata)
  return {
    ownerHash: reference.ownerHash,
    imageUrl: textValue(metadata.imageTH ?? metadata.image_th),
    name: textValue(metadata.nameTH ?? metadata.name_th) ?? 'Unknown NFT',
    tokenValue: decimalFromWei(attributes.get('original price')),
    type: textValue(attributes.get('type')),
    detailTH: textValue(attributes.get('detail th')),
    conditionTH: textValue(attributes.get('condition th')),
    category: textValue(attributes.get('category')),
    availableDate: dateFromMetadata(attributes.get('available date')),
    expiredDate: dateFromMetadata(attributes.get('expired date')),
  }
}

export async function readNFTContractInstance(contractAddress: string, tokenId: string): Promise<NFTContractInstance> {
  const reference = await readNFTContractReference(contractAddress, tokenId)
  return readNFTMetadataInstance(reference)
}
