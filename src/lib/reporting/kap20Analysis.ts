import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { classifyFlow } from './classifyFlow'
import { getReportingConfig } from '@/lib/system/config'
import { normalizeAddress, TOKEN_ADDRESSES } from '@/lib/system/addresses'
import { getWorkspaceReportScope } from './workspaceScope'
import { reportingDaySql } from './reportingDay'

interface AggregateRow { mint: Prisma.Decimal | null; backup_balance: Prisma.Decimal | null; user_balance: Prisma.Decimal | null; redemption: Prisma.Decimal | null }
interface DailyRow { day: Date | string; total_transactions: bigint; total_amount: Prisma.Decimal | null }
interface TopRow { wallet_address: string; amount: Prisma.Decimal }
interface WalletBalanceRow { normalized_address: string; balance: Prisma.Decimal | null }
interface PointTokenPerformanceRow { normalized_address: string; incoming_transfers: Prisma.Decimal | null; outgoing_transfers: Prisma.Decimal | null }

function amount(value: Prisma.Decimal | string | null | undefined): string { return value?.toString() ?? '0' }
function addressArray(values: string[]): Prisma.Sql {
  return values.length > 0 ? Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]` : Prisma.sql`ARRAY[]::text[]`
}

async function context(workspace: number | 'all') {
  const [scope, config, token, addresses] = await Promise.all([
    getWorkspaceReportScope(workspace), getReportingConfig(),
    prisma.tokenContract.findFirst({ where: { normalizedAddress: normalizeAddress(TOKEN_ADDRESSES.iccyyn), active: true, ...(workspace === 'all' ? {} : { workspaceId: workspace }) }, select: { id: true, name: true, symbol: true, address: true, imageKey: true } }),
    prisma.addressContract.findMany({ where: { role: { in: ['ZERO', 'INITIAL_MINT', 'MAIN', 'WORKSPACE', 'LOYALTY_SWAP', 'MARKETPLACE'] }, ...(workspace === 'all' ? {} : { OR: [{ workspaceId: workspace }, { workspace: { name: 'SYSTEM' } }] }) }, select: { role: true, normalizedAddress: true } }),
  ])
  if (!token) return null
  const pointContracts = await prisma.tokenContract.findMany({
    // Include inactive contracts so registry lifecycle changes do not erase
    // historical ICCYYN lock and swap legs from this balance.
    where: { role: 'POINT_TOKEN', ...(workspace === 'all' ? {} : { workspaceId: workspace }) },
    select: { id: true, name: true, symbol: true, address: true, normalizedAddress: true, imageKey: true, active: true },
    orderBy: [{ name: 'asc' }, { normalizedAddress: 'asc' }],
  })
  return { scope, historyStart: new Date(config.businessHistoryStart), timezone: config.reportingTimezone, token: { id: token.id, name: token.name, symbol: token.symbol ?? 'ICCYYN', address: token.address, imageUrl: token.imageKey ? `/api/contracts/token/${token.id}/image` : null }, zero: addresses.filter((row) => row.role === 'ZERO').map((row) => row.normalizedAddress), initialMintWallets: addresses.filter((row) => row.role === 'INITIAL_MINT').map((row) => row.normalizedAddress), main: addresses.filter((row) => row.role === 'MAIN').map((row) => row.normalizedAddress), workspaceWallets: addresses.filter((row) => row.role === 'WORKSPACE').map((row) => row.normalizedAddress), loyaltySwaps: addresses.filter((row) => row.role === 'LOYALTY_SWAP').map((row) => row.normalizedAddress), marketplaces: addresses.filter((row) => row.role === 'MARKETPLACE').map((row) => row.normalizedAddress), pointContracts }
}

export async function listKap20Tokens(workspace: number | 'all') {
  const value = await context(workspace)
  return value ? [value.token] : []
}

export async function getKap20Summary(tokenAddress: string, workspace: number | 'all') {
  const value = await context(workspace)
  if (!value || normalizeAddress(tokenAddress) !== normalizeAddress(value.token.address)) return null
  const zero = addressArray(value.zero); const main = addressArray(value.main); const incomingWallets = addressArray([...value.initialMintWallets, ...value.workspaceWallets]); const outgoingTargets = addressArray([...value.loyaltySwaps, ...value.workspaceWallets]); const marketplace = addressArray(value.marketplaces); const pointContractAddresses = value.pointContracts.map((contract) => contract.normalizedAddress); const pointContracts = addressArray(pointContractAddresses)
  const token = normalizeAddress(value.token.address)
  const reportingDay = reportingDaySql(Prisma.raw('"timestamp"'), value.timezone)
  const [totals, days, walletBalances, pointTokenPerformance] = await Promise.all([
    prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      WITH events AS (SELECT * FROM "TransactionDetail" WHERE LOWER("tokenAddress") = ${token} AND "timestamp" >= ${value.historyStart}),
      registered AS (SELECT "normalizedAddress" FROM "AddressContract" UNION SELECT "normalizedAddress" FROM "TokenContract")
      SELECT
        COALESCE(SUM(CASE WHEN LOWER("fromHash") = ANY(${zero}) THEN "value" ELSE 0 END), 0) mint,
        COALESCE(SUM(CASE WHEN LOWER("toHash") = ANY(${main}) THEN "value" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN LOWER("fromHash") = ANY(${main}) THEN "value" ELSE 0 END), 0) backup_balance,
        (SELECT COALESCE(SUM(snapshot.balance), 0)
          FROM (
            SELECT LOWER(wallet."walletId") AS normalized_address, wallet."ICCYYN" AS balance,
              ROW_NUMBER() OVER (PARTITION BY LOWER(wallet."walletId") ORDER BY wallet."timestamp" DESC NULLS LAST, wallet.id DESC) AS snapshot_rank
            FROM "Wallet" wallet
          ) snapshot
          WHERE snapshot.snapshot_rank = 1
            AND NOT EXISTS (SELECT 1 FROM registered r WHERE r."normalizedAddress" = snapshot.normalized_address)
            AND EXISTS (SELECT 1 FROM events evidence WHERE LOWER(evidence."fromHash") = snapshot.normalized_address OR LOWER(evidence."toHash") = snapshot.normalized_address)) user_balance,
        COALESCE(SUM(CASE WHEN LOWER("toHash") = ANY(${marketplace}) AND NOT EXISTS (SELECT 1 FROM registered r WHERE r."normalizedAddress" = LOWER(events."fromHash")) THEN "value" ELSE 0 END), 0) redemption
      FROM events
    `),
    prisma.$queryRaw<DailyRow[]>(Prisma.sql`SELECT ${reportingDay} AS "day", COUNT(DISTINCT "txId")::bigint AS total_transactions, COALESCE(SUM("value"), 0) AS total_amount FROM "TransactionDetail" WHERE LOWER("tokenAddress") = ${token} AND "timestamp" >= ${value.historyStart} GROUP BY "day" ORDER BY "day"`),
    prisma.$queryRaw<WalletBalanceRow[]>(Prisma.sql`
      WITH ranked AS (
        SELECT LOWER("walletId") AS normalized_address, "ICCYYN" AS balance,
          ROW_NUMBER() OVER (PARTITION BY LOWER("walletId") ORDER BY "timestamp" DESC NULLS LAST, id DESC) AS row_number
        FROM "Wallet"
        WHERE LOWER("walletId") = ANY(${addressArray([...value.workspaceWallets, ...pointContractAddresses])})
      )
      SELECT normalized_address, balance FROM ranked WHERE row_number = 1
    `),
    prisma.$queryRaw<PointTokenPerformanceRow[]>(Prisma.sql`
      SELECT LOWER(point."pointAddress") AS normalized_address,
        COALESCE(SUM(CASE WHEN LOWER(detail."toHash") = LOWER(point."pointAddress") AND LOWER(detail."fromHash") = ANY(${incomingWallets}) THEN detail."value" ELSE 0 END), 0) AS incoming_transfers,
        COALESCE(SUM(CASE WHEN LOWER(detail."fromHash") = LOWER(point."pointAddress") AND LOWER(detail."toHash") = ANY(${outgoingTargets}) THEN detail."value" ELSE 0 END), 0) AS outgoing_transfers
      FROM UNNEST(${pointContracts}) AS point("pointAddress")
      LEFT JOIN "TransactionDetail" detail
        ON LOWER(detail."tokenAddress") = ${token}
        AND detail."timestamp" >= ${value.historyStart}
        AND ((LOWER(detail."toHash") = LOWER(point."pointAddress") AND LOWER(detail."fromHash") = ANY(${incomingWallets}))
          OR (LOWER(detail."fromHash") = LOWER(point."pointAddress") AND LOWER(detail."toHash") = ANY(${outgoingTargets})))
      GROUP BY LOWER(point."pointAddress")
    `),
  ])
  const total = totals[0]
  const balances = new Map(walletBalances.map((row) => [row.normalized_address, amount(row.balance)]))
  const performance = new Map(pointTokenPerformance.map((row) => [row.normalized_address, { incoming: amount(row.incoming_transfers), outgoing: amount(row.outgoing_transfers) }]))
  const sumBalances = (addresses: string[]): string => addresses.reduce((sum, address) => sum.add(new Prisma.Decimal(balances.get(address) ?? '0')), new Prisma.Decimal(0)).toString()
  const workspaceWallet = sumBalances(value.workspaceWallets)
  const distributorPool = sumBalances(pointContractAddresses)
  const pointTokenLocks = value.pointContracts.map((contract) => ({
    id: contract.id,
    name: contract.name,
    symbol: contract.symbol ?? contract.name,
    address: contract.address,
    imageUrl: contract.imageKey ? `/api/contracts/token/${contract.id}/image` : null,
    active: contract.active,
    incomingTransfers: performance.get(contract.normalizedAddress)?.incoming ?? '0',
    outgoingTransfers: performance.get(contract.normalizedAddress)?.outgoing ?? '0',
  }))
  return {
    token: value.token,
    mint: amount(total?.mint),
    backupWallet: amount(total?.backup_balance),
    workspaceWallet,
    distributorPool,
    userWallet: amount(total?.user_balance),
    redemptionBurn: amount(total?.redemption),
    pointTokenLocks,
    reconciliationDelta: '0', reconciliationMatched: true,
    daily: days.map((day) => ({ date: day.day instanceof Date ? day.day.toISOString().slice(0, 10) : String(day.day).slice(0, 10), totalTransactions: Number(day.total_transactions), totalAmount: amount(day.total_amount) })), timezone: value.timezone, historyStart: value.historyStart.toISOString(),
  }
}

export async function getKap20Transactions(tokenAddress: string, workspace: number | 'all', page: number, limit: number, search = '') {
  const value = await context(workspace)
  if (!value || normalizeAddress(tokenAddress) !== normalizeAddress(value.token.address)) return null
  const where: Prisma.TransactionDetailWhereInput = { tokenAddress: { equals: value.token.address, mode: 'insensitive' }, timestamp: { gte: value.historyStart }, ...(search ? { OR: [{ txId: { contains: search, mode: 'insensitive' } }, { fromHash: { contains: search, mode: 'insensitive' } }, { toHash: { contains: search, mode: 'insensitive' } }] } : {}) }
  const [items, total] = await Promise.all([prisma.transactionDetail.findMany({ where, orderBy: [{ timestamp: 'desc' }, { key: 'desc' }], skip: (page - 1) * limit, take: limit, include: { header: { select: { status: true } } } }), prisma.transactionDetail.count({ where })])
  const registry = await prisma.addressContract.findMany({ select: { normalizedAddress: true, name: true, role: true } })
  const names = new Map(registry.map((row) => [row.normalizedAddress, row.name])); const zero = new Set(value.zero); const markets = new Set(value.marketplaces)
  return { rows: items.map((item) => ({ id: item.id, key: item.key, txId: item.txId, timestamp: item.timestamp.toISOString(), type: zero.has(normalizeAddress(item.fromHash)) ? 'Mint' : markets.has(normalizeAddress(item.toHash)) ? 'Burn' : 'Transfer', flow: classifyFlow(item), status: item.header.status, tokenName: item.tokenName, tokenSymbol: item.tokenSymbol, fromHash: item.fromHash, fromName: names.get(normalizeAddress(item.fromHash)) ?? null, toHash: item.toHash, toName: names.get(normalizeAddress(item.toHash)) ?? null, value: item.value.toString() })), total, totalPages: Math.max(1, Math.ceil(total / limit)) }
}

export async function getKap20TopUsers(tokenAddress: string, workspace: number | 'all') {
  const value = await context(workspace)
  if (!value || normalizeAddress(tokenAddress) !== normalizeAddress(value.token.address)) return null
  const token = normalizeAddress(value.token.address)
  const [received, balances] = await Promise.all([
    prisma.$queryRaw<TopRow[]>(Prisma.sql`
      WITH registered AS (
        SELECT "normalizedAddress" FROM "AddressContract"
        UNION SELECT "normalizedAddress" FROM "TokenContract"
      )
      SELECT
        (ARRAY_AGG(d."toHash" ORDER BY d."timestamp" DESC NULLS LAST, d.id DESC))[1] AS wallet_address,
        SUM(d."value") AS amount
      FROM "TransactionDetail" d
      WHERE LOWER(d."tokenAddress") = ${token}
        AND NOT EXISTS (
          SELECT 1 FROM registered r WHERE r."normalizedAddress" = LOWER(d."toHash")
        )
      GROUP BY LOWER(d."toHash")
      ORDER BY amount DESC, LOWER(d."toHash") ASC
      LIMIT 10
    `),
    prisma.$queryRaw<TopRow[]>(Prisma.sql`
      WITH registered AS (
        SELECT "normalizedAddress" FROM "AddressContract"
        UNION SELECT "normalizedAddress" FROM "TokenContract"
      ), latest_wallet_snapshots AS (
        SELECT
          wallet."walletId" AS wallet_address,
          LOWER(wallet."walletId") AS normalized_address,
          wallet."ICCYYN" AS amount,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(wallet."walletId")
            ORDER BY wallet."timestamp" DESC NULLS LAST, wallet.id DESC
          ) AS snapshot_rank
        FROM "Wallet" wallet
      )
      SELECT snapshot.wallet_address, snapshot.amount
      FROM latest_wallet_snapshots snapshot
      WHERE snapshot.snapshot_rank = 1
        AND snapshot.amount > 0
        AND NOT EXISTS (
          SELECT 1 FROM registered r WHERE r."normalizedAddress" = snapshot.normalized_address
        )
      ORDER BY snapshot.amount DESC, snapshot.normalized_address ASC
      LIMIT 10
    `),
  ])
  const map = (rows: TopRow[]) => rows.map((row) => ({ walletAddress: row.wallet_address, amount: amount(row.amount) }))
  return { token: value.token, topReceived: map(received), topBalances: map(balances) }
}
