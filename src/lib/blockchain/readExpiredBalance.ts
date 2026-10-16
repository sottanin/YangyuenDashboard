import { isValidAddress, normalizeAddress } from '@/lib/system/addresses'

const KUB_MAINNET_RPC_URL = 'https://rpc.bitkubchain.io'
const BALANCE_OF_EXPIRED_SELECTOR = '75856412'
const RPC_TIMEOUT_MS = 15_000
const MAX_RPC_RESPONSE_BYTES = 32_768
const MAX_CONTRACTS_PER_BATCH = 9
const MAX_ATTEMPTS = 3
const UINT256_HEX_PATTERN = /^0x[0-9a-fA-F]{1,64}$/

interface JsonRpcResponse {
  jsonrpc?: unknown
  id?: unknown
  result?: unknown
  error?: unknown
}

class TransientRpcError extends Error {}

function encodeBalanceOfExpiredCall(account: string): string {
  if (!isValidAddress(account)) throw new Error('Invalid wallet address for balanceOfExpired')
  return `0x${BALANCE_OF_EXPIRED_SELECTOR}${account.slice(2).toLowerCase().padStart(64, '0')}`
}

async function readLimitedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const size = Number(contentLength)
    if (Number.isFinite(size) && size > MAX_RPC_RESPONSE_BYTES) throw new Error('KUB RPC response is too large')
  }
  if (!response.body) throw new Error('KUB RPC returned an empty response body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytesRead += chunk.value.byteLength
    if (bytesRead > MAX_RPC_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('KUB RPC response is too large')
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  return body + decoder.decode()
}

function shouldRetry(error: unknown): boolean {
  return error instanceof TransientRpcError
    || (error instanceof DOMException && error.name === 'TimeoutError')
    || error instanceof TypeError
}

async function waitForRetry(attempt: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250))
}

export function formatUnits18(rawValue: bigint): string {
  if (rawValue < BigInt(0)) throw new Error('Token balance cannot be negative')
  const digits = rawValue.toString().padStart(19, '0')
  const integer = digits.slice(0, -18)
  const fraction = digits.slice(-18).replace(/0+$/, '')
  return fraction.length > 0 ? `${integer}.${fraction}` : integer
}

async function requestExpiredBalances(contractAddresses: readonly string[], account: string): Promise<Map<string, string>> {
  const callData = encodeBalanceOfExpiredCall(account)
  const payload = contractAddresses.map((contractAddress, index) => ({
    jsonrpc: '2.0',
    id: index + 1,
    method: 'eth_call',
    params: [{ to: contractAddress, data: callData }, 'latest'],
  }))
  const response = await fetch(KUB_MAINNET_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (response.status === 429 || response.status >= 500) throw new TransientRpcError(`KUB RPC returned HTTP ${response.status}`)
  if (!response.ok) throw new Error(`KUB RPC returned HTTP ${response.status}`)

  const body = await readLimitedBody(response)
  const parsed: unknown = JSON.parse(body)
  if (!Array.isArray(parsed) || parsed.length !== contractAddresses.length) throw new Error('KUB RPC returned an incomplete batch response')

  const byId = new Map<number, JsonRpcResponse>()
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('KUB RPC returned invalid JSON-RPC data')
    const rpc = item as JsonRpcResponse
    if (typeof rpc.id !== 'number' || !Number.isSafeInteger(rpc.id) || rpc.id < 1 || rpc.id > contractAddresses.length || byId.has(rpc.id)) {
      throw new Error('KUB RPC returned an invalid or duplicate batch response id')
    }
    byId.set(rpc.id, rpc)
  }

  const balances = new Map<string, string>()
  for (let index = 0; index < contractAddresses.length; index += 1) {
    const rpc = byId.get(index + 1)
    if (!rpc || rpc.jsonrpc !== '2.0' || rpc.error !== undefined || typeof rpc.result !== 'string' || !UINT256_HEX_PATTERN.test(rpc.result)) {
      throw new Error('KUB RPC returned an invalid balanceOfExpired batch result')
    }
    balances.set(contractAddresses[index], formatUnits18(BigInt(rpc.result)))
  }
  return balances
}

export async function readExpiredBalances(contractAddresses: readonly string[], account: string): Promise<Map<string, string>> {
  if (!isValidAddress(account)) throw new Error('Invalid wallet address for balanceOfExpired')
  if (contractAddresses.length > MAX_CONTRACTS_PER_BATCH) throw new Error('Too many Point Token contracts in balanceOfExpired batch')
  if (contractAddresses.length === 0) return new Map()

  const normalizedContracts = contractAddresses.map((address) => {
    if (!isValidAddress(address)) throw new Error('Invalid token contract address for balanceOfExpired')
    return normalizeAddress(address)
  })
  if (new Set(normalizedContracts).size !== normalizedContracts.length) throw new Error('Duplicate Point Token contract in balanceOfExpired batch')

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestExpiredBalances(normalizedContracts, account)
    } catch (error) {
      if (!shouldRetry(error) || attempt === MAX_ATTEMPTS) throw error
      await waitForRetry(attempt)
    }
  }
  throw new Error('KUB RPC retry loop ended unexpectedly')
}
