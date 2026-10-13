import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { isValidAddress, normalizeAddress } from './system/addresses'
import {
  WALLET_BALANCE_FIELD_BY_TOKEN_ADDRESS,
  type WalletBalanceField,
} from './walletBalances'

const KUBSCAN_BASE = 'https://www.kubscan.com/api/v2/tokens'
const KUBSCAN_ADDR = 'https://www.kubscan.com/api/v2/addresses'

type RegistryToken = {
  address: string
  name: string
  symbol: string | null
  standard: string | null
}

function cutoffDate(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

async function assertPipelineActive(coordinatorId?: string): Promise<void> {
  if (!coordinatorId) return
  const coordinator = await prisma.batchJobLog.findUnique({ where: { id: coordinatorId }, select: { status: true, stoppedReason: true } })
  if (coordinator?.status !== 'running' || coordinator.stoppedReason === 'cancellation_requested') throw new Error('Batch pipeline was cancelled')
}

async function assertJobRunning(logId: string, coordinatorId?: string): Promise<void> {
  const [log] = await Promise.all([
    prisma.batchJobLog.findUnique({ where: { id: logId }, select: { status: true } }),
    assertPipelineActive(coordinatorId),
  ])
  if (log?.status !== 'running') throw new Error('Batch job was cancelled')
}

// Convert raw blockchain wei value to Decimal using BigInt string manipulation (avoids float precision loss)
function fromWei(v: unknown, decimals = 18): Prisma.Decimal {
  if (v === null || v === undefined || v === '') return new Prisma.Decimal(0)
  const raw = String(v).trim().replace(/\..*$/, '') // strip any fractional part — raw wei is always integer
  if (!/^\d+$/.test(raw) || raw === '0') return new Prisma.Decimal(0)
  const padded = raw.padStart(decimals + 1, '0')
  const intPart = padded.slice(0, padded.length - decimals) || '0'
  const fracPart = padded.slice(padded.length - decimals)
  return new Prisma.Decimal(`${intPart}.${fracPart}`)
}

interface KubScanItem {
  block_hash: string
  block_number: string
  from: { hash: string }
  to: { hash: string }
  log_index: string
  method: string
  timestamp: string
  token: { address: string; name: string; symbol: string; type: string }
  total: { value?: string; decimals?: string; token_id?: string }
  tx_hash: string
  type: string
}

interface KubScanResponse {
  items: KubScanItem[]
  next_page_params?: { block_number: number; index: number } | null
}

interface KubScanTxResponse {
  fee?: { type?: string; value?: string }
  gas_price?: string
  gas_used?: number | string
  status?: string
  result?: string
}

interface NFTAttribute {
  trait_type: string
  value: string | number
}

interface NFTInstanceResponse {
  id: string
  is_unique?: boolean
  metadata?: { image?: string; name?: string; attributes?: NFTAttribute[] }
  owner?: { hash?: string }
  token?: { address?: string; value?: string }
}

function extractOriginalPrice(attrs?: NFTAttribute[]): Prisma.Decimal | null {
  if (!attrs) return null
  const trait = attrs.find((a) => a.trait_type === 'Original Price')
  if (!trait) return null
  return fromWei(trait.value)
}

export async function runBatchJob(coordinatorId?: string): Promise<void> {
  const config = await prisma.systemConfig.findUnique({ where: { key: 'batchCutoffDays' } })
  const configValue = config?.value ?? '7'
  let cutoff: Date | null = null
  if (configValue === 'all') {
    cutoff = null
  } else {
    const rawDays = parseInt(configValue, 10)
    const cutoffDays = isNaN(rawDays) || rawDays <= 0 ? 7 : rawDays
    cutoff = cutoffDate(cutoffDays)
  }

  const tokens = await prisma.tokenContract.findMany({
    where: { active: true, standard: { in: ['KAP-20', 'KAP-22'] } },
    orderBy: [{ standard: 'asc' }, { name: 'asc' }],
  })

  for (const token of tokens) {
    await assertPipelineActive(coordinatorId)
    const log = await prisma.batchJobLog.create({
      data: {
        status: 'running',
        tokenName: token.name,
        tokenAddress: token.address,
      },
    })

    let url = `${KUBSCAN_BASE}/${token.address}/transfers`
    let totalFetched = 0
    let totalInserted = 0
    let totalUpdated = 0
    let pagesScanned = 0
    let stoppedReason = 'no_more_pages'
    let done = false

    try {
      while (!done) {
        await assertJobRunning(log.id, coordinatorId)
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
        const data: KubScanResponse = await res.json()

        pagesScanned++
        const items = data.items || []
        totalFetched += items.length

        for (const item of items) {
          await assertJobRunning(log.id, coordinatorId)
          const ts = new Date(item.timestamp)

          // Stop if older than cutoff (only when cutoff is set)
          if (cutoff !== null && ts < cutoff) {
            done = true
            stoppedReason = 'cutoff_reached'
            break
          }

          const key = `${item.log_index}_${item.tx_hash}`
          const txId = item.tx_hash
          if (item.token?.address && normalizeAddress(item.token.address) !== normalizeAddress(token.address)) {
            throw new Error(`KubScan returned a different token contract for ${token.address}`)
          }

          // Upsert TransactionHeader (create if not exists, skip update to preserve fee data)
          await prisma.transactionHeader.upsert({
            where: { txId },
            create: {
              txId,
              timestamp: ts,
              txValue: new Prisma.Decimal(0),
              fee: new Prisma.Decimal(0),
              block: item.block_number ? BigInt(item.block_number) : null,
            },
            update: {},
          })

          // Upsert TransactionDetail
          const existing = await prisma.transactionDetail.findUnique({ where: { key } })

          const detailData = {
            key,
            txId,
            blockHash: item.block_hash || null,
            fromHash: item.from?.hash || 'unknown',
            toHash: item.to?.hash || 'unknown',
            method: item.method || 'unknown',
            timestamp: ts,
            tokenAddress: token.address,
            tokenName: item.token?.name || token.name,
            tokenSymbol: item.token?.symbol || token.symbol || '',
            tokenType: token.standard || 'KAP-20',
            decimals: item.total?.decimals ? parseInt(item.total.decimals, 10) : null,
            value: fromWei(item.total?.value, item.total?.decimals ? parseInt(item.total.decimals, 10) : 18),
            txType: item.type || 'token_transfer',
          }

          if (existing) {
            await prisma.transactionDetail.update({ where: { key }, data: detailData })
            totalUpdated++
          } else {
            await prisma.transactionDetail.create({ data: detailData })
            totalInserted++
          }
        }

        if (!done && data.next_page_params) {
          const { block_number, index } = data.next_page_params
          url = `${KUBSCAN_BASE}/${token.address}/transfers?block_number=${block_number}&index=${index}`
        } else {
          done = true
        }
      }

      const completed = await prisma.batchJobLog.updateMany({
        where: { id: log.id, status: 'running' },
        data: {
          finishedAt: new Date(),
          status: 'completed',
          totalFetched,
          totalInserted,
          totalUpdated,
          pagesScanned,
          stoppedReason,
        },
      })
      if (completed.count === 0) throw new Error('Batch job was cancelled')
    } catch (err) {
      await prisma.batchJobLog.updateMany({
        where: { id: log.id, status: 'running' },
        data: {
          finishedAt: new Date(),
          status: 'failed',
          totalFetched,
          totalInserted,
          totalUpdated,
          pagesScanned,
          error: err instanceof Error ? err.message : String(err),
        },
      })
      throw err
    }
  }
}

interface TokenBalanceItem {
  token?: { address?: string; name?: string; symbol?: string; decimals?: string; type?: string }
  value?: string
}

const CANONICAL_TOKEN_DECIMALS = 18
const MAX_UINT256_DECIMAL_DIGITS = 78
const MAX_TOKEN_BALANCE_RESPONSE_BYTES = 1_000_000
const MAX_TOKEN_BALANCE_ITEMS = 10_000
const WALLET_BALANCE_FETCH_TIMEOUT_MS = 15_000

async function readTokenBalanceResponse(res: Response): Promise<TokenBalanceItem[]> {
  const contentLength = res.headers.get('content-length')
  if (contentLength !== null) {
    const parsedLength = Number(contentLength)
    if (Number.isFinite(parsedLength) && parsedLength > MAX_TOKEN_BALANCE_RESPONSE_BYTES) {
      throw new Error('KubScan token-balance response is too large')
    }
  }

  const body = await res.text()
  if (body.length > MAX_TOKEN_BALANCE_RESPONSE_BYTES) {
    throw new Error('KubScan token-balance response is too large')
  }

  const parsed: unknown = JSON.parse(body)
  if (!Array.isArray(parsed) || parsed.length > MAX_TOKEN_BALANCE_ITEMS) {
    throw new Error('KubScan returned an invalid token-balance response')
  }
  return parsed as TokenBalanceItem[]
}

export function mapCanonicalTokenBalance(item: unknown):
  | { field: WalletBalanceField; value: Prisma.Decimal }
  | null {
  if (typeof item !== 'object' || item === null) return null
  const candidate = item as TokenBalanceItem
  const address = candidate.token?.address
  if (typeof address !== 'string') return null

  const field = WALLET_BALANCE_FIELD_BY_TOKEN_ADDRESS[normalizeAddress(address)]
  if (!field) return null

  const decimalsText = candidate.token?.decimals
  if (typeof decimalsText !== 'string' || !/^\d+$/.test(decimalsText)) return null

  const decimals = Number(decimalsText)
  if (!Number.isSafeInteger(decimals) || decimals !== CANONICAL_TOKEN_DECIMALS) return null

  const rawValue = candidate.value
  if (typeof rawValue !== 'string') return null
  const normalizedRawValue = rawValue.trim()
  if (
    normalizedRawValue.length === 0
    || normalizedRawValue.length > MAX_UINT256_DECIMAL_DIGITS
    || !/^\d+$/.test(normalizedRawValue)
  ) return null

  return {
    field,
    value: fromWei(normalizedRawValue, CANONICAL_TOKEN_DECIMALS),
  }
}

function zeroWalletBalances(): Record<WalletBalanceField, Prisma.Decimal> {
  return {
    ICCYYN: new Prisma.Decimal(0),
    FIT: new Prisma.Decimal(0),
    TGT: new Prisma.Decimal(0),
    INT: new Prisma.Decimal(0),
    GRN: new Prisma.Decimal(0),
    YYN: new Prisma.Decimal(0),
    EVT: new Prisma.Decimal(0),
    HLT: new Prisma.Decimal(0),
    SCT: new Prisma.Decimal(0),
    GVT: new Prisma.Decimal(0),
  }
}

async function createWalletSyncLog(): Promise<{ id: string } | null> {
  return prisma.$transaction(async (tx) => {
    // Serializes the running-log check across requests without requiring a schema change.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(93422001)`

    const running = await tx.batchJobLog.findFirst({
      where: { status: 'running', tokenName: 'WalletSync' },
      select: { id: true },
    })
    if (running) return null

    return tx.batchJobLog.create({
      data: { status: 'running', tokenName: 'WalletSync', tokenAddress: 'all' },
      select: { id: true },
    })
  })
}

export async function runWalletSyncJob(coordinatorId?: string): Promise<void> {
  await assertPipelineActive(coordinatorId)
  const log = await createWalletSyncLog()
  if (!log) {
    console.warn('[WalletSync] Skipped because another wallet sync is already running')
    return
  }

  let totalFetched = 0
  let totalInserted = 0
  let totalUpdated = 0
  let errorCount = 0

  try {
    // Collect all unique wallet addresses from both transaction tables
    const [txFroms, txTos, rdmFroms, rdmTos] = await Promise.all([
      prisma.transactionDetail.findMany({ select: { fromHash: true }, distinct: ['fromHash'] }),
      prisma.transactionDetail.findMany({ select: { toHash: true }, distinct: ['toHash'] }),
      prisma.redemptionTransactionDetail.findMany({ select: { fromHash: true }, distinct: ['fromHash'] }),
      prisma.redemptionTransactionDetail.findMany({ select: { toHash: true }, distinct: ['toHash'] }),
    ])

    // Comparisons are case-insensitive, while the first raw/checksum spelling is
    // retained for display and KubScan requests.
    const allWalletIds = new Map<string, string>()
    const rawWalletIds = [
      ...txFroms.map(r => r.fromHash),
      ...txTos.map(r => r.toHash),
      ...rdmFroms.map(r => r.fromHash),
      ...rdmTos.map(r => r.toHash),
    ]
    for (const walletId of rawWalletIds) {
      if (!walletId || walletId.toLowerCase() === 'unknown') continue
      const normalizedWalletId = normalizeAddress(walletId)
      if (!allWalletIds.has(normalizedWalletId)) allWalletIds.set(normalizedWalletId, walletId)
    }

    console.log(`[WalletSync] Found ${allWalletIds.size} unique wallet addresses`)

    // Upsert wallet IDs — insert new ones, skip existing
    for (const walletId of allWalletIds.values()) {
      const existing = await prisma.wallet.findFirst({
        where: { walletId: { equals: walletId, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!existing) {
        await prisma.wallet.create({ data: { walletId } })
        totalInserted++
        console.log('[WalletSync] Inserted new wallet record')
      }
    }

    // Fetch a complete snapshot before changing any balances. This prevents a transient
    // KubScan failure or cancellation from leaving every wallet partially reset to zero.
    const walletRows = await prisma.wallet.findMany({ orderBy: { id: 'asc' } })
    const uniqueWallets = new Map<string, (typeof walletRows)[number]>()
    for (const wallet of walletRows) {
      const normalizedWalletId = normalizeAddress(wallet.walletId)
      if (!uniqueWallets.has(normalizedWalletId)) uniqueWallets.set(normalizedWalletId, wallet)
    }
    const allWallets = [...uniqueWallets.values()]
    totalFetched = allWallets.length
    console.log(`[WalletSync] Fetching balances for ${totalFetched} wallets`)

    const snapshots = new Map<string, Record<WalletBalanceField, Prisma.Decimal>>()

    for (const wallet of allWallets) {
      const currentLog = await prisma.batchJobLog.findUnique({
        where: { id: log.id },
        select: { status: true },
      })
      if (currentLog?.status !== 'running') {
        throw new Error('Wallet sync was cancelled')
      }
      await assertPipelineActive(coordinatorId)

      try {
        if (!isValidAddress(wallet.walletId)) {
          // Dirty legacy identifiers cannot be queried safely. Keep them in the atomic
          // reset snapshot, but do not let one malformed row block all valid wallets.
          snapshots.set(wallet.walletId, zeroWalletBalances())
          console.warn('[WalletSync] Reset invalid legacy wallet identifier')
          continue
        }

        const res = await fetch(
          `${KUBSCAN_ADDR}/${encodeURIComponent(wallet.walletId)}/token-balances`,
          { signal: AbortSignal.timeout(WALLET_BALANCE_FETCH_TIMEOUT_MS) },
        )
        if (!res.ok) {
          throw new Error(`KubScan returned HTTP ${res.status}`)
        }

        const balances = await readTokenBalanceResponse(res)
        const update = zeroWalletBalances()

        for (const item of balances) {
          const mapped = mapCanonicalTokenBalance(item)
          if (!mapped) continue
          update[mapped.field] = mapped.value
        }
        snapshots.set(wallet.walletId, update)
      } catch (err) {
        console.error('[WalletSync] Error processing wallet balance:', err)
        errorCount++
      }
    }

    if (errorCount > 0) {
      throw new Error(`Wallet snapshot aborted because ${errorCount} balance request(s) failed`)
    }

    await assertPipelineActive(coordinatorId)
    await prisma.$transaction(async (tx) => {
      // Serialize the final commit with another start/check and honor manual cancellation.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(93422001)`
      const currentLog = await tx.batchJobLog.findUnique({
        where: { id: log.id },
        select: { status: true },
      })
      if (currentLog?.status !== 'running') {
        throw new Error('Wallet sync was cancelled before balances were committed')
      }
      await assertPipelineActive(coordinatorId)

      // Every snapshot already starts with all canonical balances at zero. Apply
      // those complete snapshots only to the wallets that were fetched by this
      // run. A table-wide reset here could erase a wallet inserted concurrently
      // after the fetch phase even though no KubScan snapshot was obtained for it.
      for (const [walletId, balances] of snapshots) {
        const result = await tx.wallet.updateMany({
          where: { walletId: { equals: walletId, mode: 'insensitive' } },
          data: balances,
        })
        totalUpdated += result.count
      }
    }, { maxWait: 10_000, timeout: 300_000 })

    console.log(`[WalletSync] Done — inserted:${totalInserted} updated:${totalUpdated} errors:${errorCount}`)

    await prisma.batchJobLog.update({
      where: { id: log.id },
      data: {
        finishedAt: new Date(),
        status: 'completed',
        totalFetched,
        totalInserted,
        totalUpdated,
        pagesScanned: errorCount,
        stoppedReason: 'wallet_sync_done',
      },
    })
  } catch (err) {
    console.error('[WalletSync] Fatal error:', err)
    await prisma.batchJobLog.updateMany({
      where: { id: log.id, status: 'running' },
      data: {
        finishedAt: new Date(),
        status: 'failed',
        totalFetched,
        totalInserted,
        totalUpdated,
        pagesScanned: errorCount,
        error: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }
}

async function upsertNFTInstance(contract: RegistryToken, tokenId: string): Promise<void> {
  try {
    const res = await fetch(`${KUBSCAN_BASE}/${contract.address}/instances/${tokenId}`)
    if (!res.ok) return
    const data: NFTInstanceResponse = await res.json()
    if (data.token?.address && normalizeAddress(data.token.address) !== normalizeAddress(contract.address)) return
    const tokenValue = extractOriginalPrice(data.metadata?.attributes)
    const normalizedTokenAddress = normalizeAddress(contract.address)
    await prisma.nFTInstance.upsert({
      where: { normalizedTokenAddress_id: { normalizedTokenAddress, id: tokenId } },
      create: {
        id: tokenId,
        isUnique: data.is_unique ?? false,
        imageUrl: data.metadata?.image ?? null,
        name: data.metadata?.name || 'Unknown NFT',
        ownerHash: data.owner?.hash || 'unknown',
        tokenAddress: contract.address,
        normalizedTokenAddress,
        tokenValue: tokenValue ?? null,
        visible: true,
      },
      update: {
        isUnique: data.is_unique ?? false,
        imageUrl: data.metadata?.image ?? null,
        name: data.metadata?.name || 'Unknown NFT',
        ownerHash: data.owner?.hash || 'unknown',
        tokenValue: tokenValue ?? null,
      },
    })
  } catch {
    // Non-fatal: log nothing, continue batch
  }
}

export async function runRedemptionBatchJob(coordinatorId?: string): Promise<void> {
  await assertPipelineActive(coordinatorId)
  const config = await prisma.systemConfig.findUnique({ where: { key: 'batchCutoffDays' } })
  const configValue = config?.value ?? '7'
  let cutoff: Date | null = null
  if (configValue !== 'all') {
    const rawDays = parseInt(configValue, 10)
    const cutoffDays = isNaN(rawDays) || rawDays <= 0 ? 7 : rawDays
    cutoff = cutoffDate(cutoffDays)
  }

  const contracts = await prisma.tokenContract.findMany({
    where: { active: true, standard: 'KAP-721' },
    orderBy: { name: 'asc' },
    select: { address: true, name: true, symbol: true, standard: true },
  })

  for (const contract of contracts) {
    await syncRedemptionContract(contract, cutoff, coordinatorId)
  }
}

async function syncRedemptionContract(
  contract: RegistryToken,
  cutoff: Date | null,
  coordinatorId?: string,
): Promise<void> {
  await assertPipelineActive(coordinatorId)
  const log = await prisma.batchJobLog.create({
    data: { status: 'running', tokenName: contract.name, tokenAddress: contract.address },
  })

  let url = `${KUBSCAN_BASE}/${contract.address}/transfers`
  let totalFetched = 0
  let totalInserted = 0
  let totalUpdated = 0
  let pagesScanned = 0
  let stoppedReason = 'no_more_pages'
  let done = false

  try {
    while (!done) {
      await assertJobRunning(log.id, coordinatorId)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const data: KubScanResponse = await res.json()

      pagesScanned++
      const items = data.items || []
      totalFetched += items.length

      for (const item of items) {
        await assertJobRunning(log.id, coordinatorId)
        const ts = new Date(item.timestamp)

        if (cutoff !== null && ts < cutoff) {
          done = true
          stoppedReason = 'cutoff_reached'
          break
        }

        const key = `${item.log_index}_${item.tx_hash}`
        const txId = item.tx_hash
        if (item.token?.address && normalizeAddress(item.token.address) !== normalizeAddress(contract.address)) {
          throw new Error(`KubScan returned a different NFT contract for ${contract.address}`)
        }

        await prisma.redemptionTransactionHeader.upsert({
          where: { txId },
          create: {
            txId,
            timestamp: ts,
            value: new Prisma.Decimal(0),
            fee: new Prisma.Decimal(0),
            block: item.block_number ? BigInt(item.block_number) : null,
          },
          update: {},
        })

        const detailData = {
          key,
          txId,
          blockHash: item.block_hash || null,
          fromHash: item.from?.hash || 'unknown',
          toHash: item.to?.hash || 'unknown',
          method: item.method || 'unknown',
          timestamp: ts,
          tokenAddress: contract.address,
          tokenName: item.token?.name || contract.name,
          tokenSymbol: item.token?.symbol || contract.symbol || '',
          tokenType: contract.standard || 'KAP-721',
          tokenId: item.total?.token_id || null,
        }

        const existing = await prisma.redemptionTransactionDetail.findUnique({ where: { key } })
        if (existing) {
          await prisma.redemptionTransactionDetail.update({ where: { key }, data: detailData })
          totalUpdated++
        } else {
          await prisma.redemptionTransactionDetail.create({ data: detailData })
          totalInserted++
        }

        if (item.total?.token_id) {
          await upsertNFTInstance(contract, item.total.token_id)
        }
      }

      if (!done && data.next_page_params) {
        const { block_number, index } = data.next_page_params
        url = `${KUBSCAN_BASE}/${contract.address}/transfers?block_number=${block_number}&index=${index}`
      } else {
        done = true
      }
    }

    const completed = await prisma.batchJobLog.updateMany({
      where: { id: log.id, status: 'running' },
      data: {
        finishedAt: new Date(),
        status: 'completed',
        totalFetched,
        totalInserted,
        totalUpdated,
        pagesScanned,
        stoppedReason,
      },
    })
    if (completed.count === 0) throw new Error('Batch job was cancelled')
  } catch (err) {
    await prisma.batchJobLog.updateMany({
      where: { id: log.id, status: 'running' },
      data: {
        finishedAt: new Date(),
        status: 'failed',
        totalFetched,
        totalInserted,
        totalUpdated,
        pagesScanned,
        error: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }
}

const KUBSCAN_TX = 'https://www.kubscan.com/api/v2/transactions'
const FEE_BATCH_SIZE = 10

export async function runFeeUpdateJob(coordinatorId?: string): Promise<void> {
  await assertPipelineActive(coordinatorId)
  const log = await prisma.batchJobLog.create({
    data: { status: 'running', tokenName: 'FeeUpdate', tokenAddress: 'all' },
  })

  let totalFetched = 0
  let totalUpdated = 0
  let errorCount = 0

  try {
    const [txHeaders, rTxHeaders] = await Promise.all([
      prisma.transactionHeader.findMany({ where: { fee: 0 }, select: { txId: true } }),
      prisma.redemptionTransactionHeader.findMany({ where: { fee: 0 }, select: { txId: true } }),
    ])

    totalFetched = txHeaders.length + rTxHeaders.length
    console.log(`[FeeUpdate] ${txHeaders.length} TX headers, ${rTxHeaders.length} Redemption headers with fee=0`)

    for (let i = 0; i < txHeaders.length; i += FEE_BATCH_SIZE) {
      await assertJobRunning(log.id, coordinatorId)
      const batch = txHeaders.slice(i, i + FEE_BATCH_SIZE)
      await Promise.all(
        batch.map(async ({ txId }) => {
          try {
            const res = await fetch(`${KUBSCAN_TX}/${txId}`)
            if (!res.ok) return
            const data: KubScanTxResponse = await res.json()
            const fee = fromWei(data.fee?.value)
            if (fee.gt(0)) {
              await prisma.transactionHeader.update({
                where: { txId },
                data: {
                  fee,
                  gasPrice: data.gas_price ? fromWei(data.gas_price) : undefined,
                  gasUsed: data.gas_used != null ? parseInt(String(data.gas_used), 10) : undefined,
                  status: data.status ?? undefined,
                  result: data.result ?? undefined,
                },
              })
              totalUpdated++
            }
          } catch {
            errorCount++
          }
        }),
      )
    }

    for (let i = 0; i < rTxHeaders.length; i += FEE_BATCH_SIZE) {
      await assertJobRunning(log.id, coordinatorId)
      const batch = rTxHeaders.slice(i, i + FEE_BATCH_SIZE)
      await Promise.all(
        batch.map(async ({ txId }) => {
          try {
            const res = await fetch(`${KUBSCAN_TX}/${txId}`)
            if (!res.ok) return
            const data: KubScanTxResponse = await res.json()
            const fee = fromWei(data.fee?.value)
            if (fee.gt(0)) {
              await prisma.redemptionTransactionHeader.update({
                where: { txId },
                data: {
                  fee,
                  gasPrice: data.gas_price ? fromWei(data.gas_price) : undefined,
                  gasUsed: data.gas_used != null ? parseInt(String(data.gas_used), 10) : undefined,
                  status: data.status ?? undefined,
                  result: data.result ?? undefined,
                },
              })
              totalUpdated++
            }
          } catch {
            errorCount++
          }
        }),
      )
    }

    console.log(`[FeeUpdate] Done — fetched:${totalFetched} updated:${totalUpdated} errors:${errorCount}`)

    const completed = await prisma.batchJobLog.updateMany({
      where: { id: log.id, status: 'running' },
      data: {
        finishedAt: new Date(),
        status: 'completed',
        totalFetched,
        totalUpdated,
        pagesScanned: errorCount,
        stoppedReason: 'fee_update_done',
      },
    })
    if (completed.count === 0) throw new Error('Batch job was cancelled')
  } catch (err) {
    console.error('[FeeUpdate] Fatal error:', err)
    await prisma.batchJobLog.updateMany({
      where: { id: log.id, status: 'running' },
      data: {
        finishedAt: new Date(),
        status: 'failed',
        totalFetched,
        totalUpdated,
        pagesScanned: errorCount,
        error: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }
}

const NFT_BATCH_SIZE = 10

export async function runNFTInstanceUpdateJob(coordinatorId?: string): Promise<void> {
  await assertPipelineActive(coordinatorId)
  const log = await prisma.batchJobLog.create({
    data: { status: 'running', tokenName: 'NFTInstanceUpdate', tokenAddress: 'registry:KAP-721' },
  })

  let totalFetched = 0
  let totalUpdated = 0
  let errorCount = 0

  try {
    const activeContracts = await prisma.tokenContract.findMany({
      where: { active: true, standard: 'KAP-721' },
      select: { normalizedAddress: true },
    })
    const instances = await prisma.nFTInstance.findMany({
      where: { normalizedTokenAddress: { in: activeContracts.map((contract) => contract.normalizedAddress) } },
      select: { id: true, tokenAddress: true, normalizedTokenAddress: true },
    })
    totalFetched = instances.length
    console.log(`[NFTInstanceUpdate] Processing ${totalFetched} NFT instances`)

    for (let i = 0; i < instances.length; i += NFT_BATCH_SIZE) {
      await assertJobRunning(log.id, coordinatorId)
      const batch = instances.slice(i, i + NFT_BATCH_SIZE)
      await Promise.all(
        batch.map(async ({ id, tokenAddress, normalizedTokenAddress }) => {
          try {
            if (!isValidAddress(tokenAddress)) throw new Error('Invalid NFT contract address')
            const res = await fetch(`${KUBSCAN_BASE}/${tokenAddress}/instances/${id}`)
            if (!res.ok) return
            const data: NFTInstanceResponse = await res.json()
            if (data.token?.address && normalizeAddress(data.token.address) !== normalizeAddress(tokenAddress)) {
              throw new Error('KubScan returned a different NFT contract')
            }
            const tokenValue = extractOriginalPrice(data.metadata?.attributes)
            await prisma.nFTInstance.update({
              where: { normalizedTokenAddress_id: { normalizedTokenAddress, id } },
              data: {
                isUnique: data.is_unique ?? false,
                imageUrl: data.metadata?.image ?? null,
                name: data.metadata?.name || 'Unknown NFT',
                ownerHash: data.owner?.hash || 'unknown',
                tokenValue: tokenValue ?? null,
              },
            })
            totalUpdated++
          } catch {
            errorCount++
          }
        }),
      )
    }

    console.log(`[NFTInstanceUpdate] Done — fetched:${totalFetched} updated:${totalUpdated} errors:${errorCount}`)

    const completed = await prisma.batchJobLog.updateMany({
      where: { id: log.id, status: 'running' },
      data: {
        finishedAt: new Date(),
        status: 'completed',
        totalFetched,
        totalUpdated,
        pagesScanned: errorCount,
        stoppedReason: 'nft_instance_update_done',
      },
    })
    if (completed.count === 0) throw new Error('Batch job was cancelled')
  } catch (err) {
    console.error('[NFTInstanceUpdate] Fatal error:', err)
    await prisma.batchJobLog.updateMany({
      where: { id: log.id, status: 'running' },
      data: {
        finishedAt: new Date(),
        status: 'failed',
        totalFetched,
        totalUpdated,
        pagesScanned: errorCount,
        error: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }
}
