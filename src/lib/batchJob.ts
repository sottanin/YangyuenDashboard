import { prisma } from './prisma'
import { Prisma } from '@prisma/client'

const KUBSCAN_BASE = 'https://www.kubscan.com/api/v2/tokens'
const KUBSCAN_ADDR = 'https://www.kubscan.com/api/v2/addresses'
const NFT_CONTRACT = '0xe089bc4b774b03f1D5F8C3f624603643F0718B62'

function cutoffDate(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function parseDecimal(v: unknown): Prisma.Decimal {
  if (v === null || v === undefined || v === '') return new Prisma.Decimal(0)
  const n = Number(v)
  return isNaN(n) ? new Prisma.Decimal(0) : new Prisma.Decimal(n)
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

interface NFTInstanceResponse {
  id: string
  is_unique?: boolean
  metadata?: { image?: string; name?: string }
  owner?: { hash?: string }
  token?: { address?: string; value?: string }
}

export async function runBatchJob(): Promise<void> {
  const config = await prisma.systemConfig.findUnique({ where: { key: 'batchCutoffDays' } })
  const rawDays = parseInt(config?.value ?? '7', 10)
  const cutoffDays = rawDays <= 0 || rawDays > 7 ? 7 : rawDays
  const cutoff = cutoffDate(cutoffDays)

  const tokens = await prisma.tokenContract.findMany()

  for (const token of tokens) {
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
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
        const data: KubScanResponse = await res.json()

        pagesScanned++
        const items = data.items || []
        totalFetched += items.length

        for (const item of items) {
          const ts = new Date(item.timestamp)

          // Stop if older than cutoff (only when cutoff is set)
          if (cutoff !== null && ts < cutoff) {
            done = true
            stoppedReason = 'cutoff_reached'
            break
          }

          const key = `${item.log_index}_${item.tx_hash}`
          const txId = item.tx_hash

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
            tokenAddress: item.token?.address || token.address,
            tokenName: item.token?.name || token.name,
            tokenSymbol: item.token?.symbol || '',
            tokenType: item.token?.type || 'ERC-20',
            decimals: item.total?.decimals ? parseInt(item.total.decimals, 10) : null,
            value: parseDecimal(item.total?.value),
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

      await prisma.batchJobLog.update({
        where: { id: log.id },
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
    } catch (err) {
      await prisma.batchJobLog.update({
        where: { id: log.id },
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
    }
  }
}

interface TokenBalanceItem {
  token: { address: string; name: string; symbol: string; decimals: string; type: string }
  value: string
}

function mapTokenNameToField(name: string): keyof typeof BALANCE_FIELDS | null {
  const n = name.toLowerCase()
  if (n.includes('icc')) return 'balanceICC'
  if (n.includes('green')) return 'balanceGreen'
  if (n.includes('together')) return 'balanceTogether'
  if (n.includes('integrity')) return 'balanceIntegrity'
  if (n.includes('fit')) return 'balanceFit'
  return null
}

const BALANCE_FIELDS = {
  balanceICC: true,
  balanceGreen: true,
  balanceTogether: true,
  balanceIntegrity: true,
  balanceFit: true,
}

export async function runWalletSyncJob(): Promise<void> {
  const log = await prisma.batchJobLog.create({
    data: { status: 'running', tokenName: 'WalletSync', tokenAddress: 'all' },
  })

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

    const allWalletIds = new Set<string>(
      [
        ...txFroms.map(r => r.fromHash),
        ...txTos.map(r => r.toHash),
        ...rdmFroms.map(r => r.fromHash),
        ...rdmTos.map(r => r.toHash),
      ].filter(id => id && id !== 'unknown')
    )

    console.log(`[WalletSync] Found ${allWalletIds.size} unique wallet addresses`)

    // Upsert wallet IDs — insert new ones, skip existing
    for (const walletId of allWalletIds) {
      const existing = await prisma.wallet.findUnique({ where: { walletId } })
      if (!existing) {
        await prisma.wallet.create({ data: { walletId } })
        totalInserted++
        console.log(`[WalletSync] Inserted new wallet: ${walletId}`)
      }
    }

    // Reset ALL wallet balances to zero before fresh fetch
    await prisma.wallet.updateMany({
      data: {
        balanceICC: new Prisma.Decimal(0),
        balanceGreen: new Prisma.Decimal(0),
        balanceTogether: new Prisma.Decimal(0),
        balanceIntegrity: new Prisma.Decimal(0),
        balanceFit: new Prisma.Decimal(0),
      },
    })
    console.log('[WalletSync] Reset all wallet balances to zero')

    // Fetch and update balances for all wallets
    const allWallets = await prisma.wallet.findMany()
    totalFetched = allWallets.length
    console.log(`[WalletSync] Fetching balances for ${totalFetched} wallets`)

    for (const wallet of allWallets) {
      try {
        const res = await fetch(`${KUBSCAN_ADDR}/${wallet.walletId}/token-balances`)
        if (!res.ok) {
          console.warn(`[WalletSync] Failed to fetch balance for ${wallet.walletId}: HTTP ${res.status}`)
          errorCount++
          continue
        }

        const balances: TokenBalanceItem[] = await res.json()
        if (!Array.isArray(balances) || balances.length === 0) continue

        const update: Partial<Record<keyof typeof BALANCE_FIELDS, Prisma.Decimal>> = {}

        for (const item of balances) {
          const field = mapTokenNameToField(item.token?.name ?? '')
          if (!field) continue
          const decimals = parseInt(item.token?.decimals ?? '18', 10)
          const rawValue = item.value ?? '0'
          const value = new Prisma.Decimal(rawValue).div(new Prisma.Decimal(10).pow(decimals))
          update[field] = value
        }

        if (Object.keys(update).length > 0) {
          await prisma.wallet.update({ where: { walletId: wallet.walletId }, data: update })
          totalUpdated++
          console.log(`[WalletSync] Updated balances for ${wallet.walletId}`)
        }
      } catch (err) {
        console.error(`[WalletSync] Error processing wallet ${wallet.walletId}:`, err)
        errorCount++
      }
    }

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
    await prisma.batchJobLog.update({
      where: { id: log.id },
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
  }
}

async function upsertNFTInstance(tokenId: string): Promise<void> {
  try {
    const res = await fetch(`${KUBSCAN_BASE}/${NFT_CONTRACT}/instances/${tokenId}`)
    if (!res.ok) return
    const data: NFTInstanceResponse = await res.json()
    await prisma.nFTInstance.upsert({
      where: { id: tokenId },
      create: {
        id: tokenId,
        isUnique: data.is_unique ?? false,
        imageUrl: data.metadata?.image ?? null,
        name: data.metadata?.name || 'Unknown NFT',
        ownerHash: data.owner?.hash || 'unknown',
        tokenAddress: data.token?.address || NFT_CONTRACT,
        tokenValue: data.token?.value ?? null,
        visible: true,
      },
      update: {
        isUnique: data.is_unique ?? false,
        imageUrl: data.metadata?.image ?? null,
        name: data.metadata?.name || 'Unknown NFT',
        ownerHash: data.owner?.hash || 'unknown',
        tokenAddress: data.token?.address || NFT_CONTRACT,
        tokenValue: data.token?.value ?? null,
      },
    })
  } catch {
    // Non-fatal: log nothing, continue batch
  }
}

export async function runRedemptionBatchJob(): Promise<void> {
  const config = await prisma.systemConfig.findUnique({ where: { key: 'batchCutoffDays' } })
  const rawDays = parseInt(config?.value ?? '7', 10)
  const cutoffDays = rawDays <= 0 || rawDays > 7 ? 7 : rawDays
  const cutoff = cutoffDate(cutoffDays)

  const log = await prisma.batchJobLog.create({
    data: {
      status: 'running',
      tokenName: 'NFT Redemption',
      tokenAddress: NFT_CONTRACT,
    },
  })

  let url = `${KUBSCAN_BASE}/${NFT_CONTRACT}/transfers`
  let totalFetched = 0
  let totalInserted = 0
  let totalUpdated = 0
  let pagesScanned = 0
  let stoppedReason = 'no_more_pages'
  let done = false

  try {
    while (!done) {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const data: KubScanResponse = await res.json()

      pagesScanned++
      const items = data.items || []
      totalFetched += items.length

      for (const item of items) {
        const ts = new Date(item.timestamp)

        if (ts < cutoff) {
          done = true
          stoppedReason = 'cutoff_reached'
          break
        }

        const key = `${item.log_index}_${item.tx_hash}`
        const txId = item.tx_hash

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
          tokenAddress: item.token?.address || NFT_CONTRACT,
          tokenName: item.token?.name || 'Unknown NFT',
          tokenSymbol: item.token?.symbol || '',
          tokenType: item.token?.type || 'ERC-721',
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
          await upsertNFTInstance(item.total.token_id)
        }
      }

      if (!done && data.next_page_params) {
        const { block_number, index } = data.next_page_params
        url = `${KUBSCAN_BASE}/${NFT_CONTRACT}/transfers?block_number=${block_number}&index=${index}`
      } else {
        done = true
      }
    }

    await prisma.batchJobLog.update({
      where: { id: log.id },
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
  } catch (err) {
    await prisma.batchJobLog.update({
      where: { id: log.id },
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
  }
}
