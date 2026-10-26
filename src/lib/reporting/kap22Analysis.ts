import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { classifyFlow, type FlowClassification } from './classifyFlow'
import { getReportingConfig } from '@/lib/system/config'
import { normalizeAddress } from '@/lib/system/addresses'
import { walletBalanceColumnForTokenAddress, walletBalanceFieldForTokenAddress, walletExpiredBalanceColumnForTokenAddress } from '@/lib/walletBalances'
import { getWorkspaceReportScope, type WorkspaceReportScope } from './workspaceScope'
import { reportingDaySql } from './reportingDay'
import type { ReportDateRange } from './reportPeriod'

const POINT_TOKEN_SYMBOL_ORDER = ['FIT', 'GRN', 'INT', 'TGT', 'EVT', 'HLT', 'SCT', 'GVT'] as const

const MAX_DAILY_CHART_POINTS = 4_000

export interface Kap22TokenOption {
  id: string
  name: string
  symbol: string
  address: string
  imageUrl: string | null
}

export interface Kap22DailyPoint {
  date: string
  totalTransactions: number
  totalAmount: string
}

export interface Kap22Summary {
  token: Kap22TokenOption
  totalTransactions: number
  distributorPool: string
  operationPool: string
  mint: string
  transferToUsers: string
  burn: string
  expired: string
  reconciliationDelta: string
  reconciliationMatched: boolean
  daily: Kap22DailyPoint[]
  timezone: string
  historyStart: string
  period?: { from: string; to: string }
  dataThrough?: string | null
  snapshotAt?: string | null
  activity?: { mint: string; burn: string; distributed: string; totalTransactions: number }
}

export type Kap22TransactionType = 'Mint' | 'Burn' | 'Transfer'

export interface Kap22TransactionRow {
  id: string
  key: string
  txId: string
  timestamp: string
  type: Kap22TransactionType
  flow: FlowClassification
  status: string | null
  tokenName: string
  tokenSymbol: string
  fromHash: string
  fromName: string | null
  toHash: string
  toName: string | null
  value: string
}

export interface Kap22TopUser {
  walletAddress: string
  amount: string
}

export interface Kap22TopUsers {
  token: Kap22TokenOption
  topReceived: Kap22TopUser[]
  topBalances: Kap22TopUser[]
}

interface NumericAggregateRow {
  distributor_pool: Prisma.Decimal | string | null
  operation_pool: Prisma.Decimal | string | null
  mint: Prisma.Decimal | string | null
  gross_transfer_to_users: Prisma.Decimal | string | null
  burn: Prisma.Decimal | string | null
}

interface DailyAggregateRow {
  day: Date | string
  total_transactions: bigint | number | string
  total_amount: Prisma.Decimal | string | null
}

interface TotalTransactionRow {
  total_transactions: bigint | number | string
}

interface ExpiredBalanceRow {
  total_expired: Prisma.Decimal | string | null
}

interface TopUserRow {
  wallet_address: string
  amount: Prisma.Decimal | string
}

interface ReportContext {
  token: Kap22TokenOption
  normalizedToken: string
  scope: WorkspaceReportScope
  historyStart: Date
  timezone: string
  zeroAddresses: string[]
  distributorAddresses: string[]
  operationAddresses: string[]
}

function decimalString(value: Prisma.Decimal | string | null | undefined): string {
  return value === null || value === undefined ? '0' : value.toString()
}

function dayKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addUtcDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return next.toISOString().slice(0, 10)
}

function addressSql(addresses: string[]): Prisma.Sql {
  return addresses.length === 0 ? Prisma.sql`ARRAY[]::text[]` : Prisma.sql`ARRAY[${Prisma.join(addresses)}]::text[]`
}

export async function listKap22Tokens(workspaceSelection: number | 'all'): Promise<Kap22TokenOption[]> {
  await getWorkspaceReportScope(workspaceSelection)
  const preferredOrder = new Map<string, number>(POINT_TOKEN_SYMBOL_ORDER.map((symbol, index) => [symbol, index]))
  const contracts = await prisma.tokenContract.findMany({
    where: {
      active: true,
      role: 'POINT_TOKEN',
      standard: 'KAP-22',
      ...(workspaceSelection === 'all' ? {} : { workspaceId: workspaceSelection }),
    },
    select: { id: true, name: true, symbol: true, address: true, normalizedAddress: true, imageKey: true },
  })
  return contracts
    .filter((contract) => walletBalanceFieldForTokenAddress(contract.normalizedAddress) !== null)
    .sort((left, right) => {
      const leftSymbol = (left.symbol ?? left.name).toUpperCase()
      const rightSymbol = (right.symbol ?? right.name).toUpperCase()
      const orderDifference = (preferredOrder.get(leftSymbol) ?? 99) - (preferredOrder.get(rightSymbol) ?? 99)
      return orderDifference !== 0 ? orderDifference : left.name.localeCompare(right.name)
    })
    .map((contract) => ({ id: contract.id, name: contract.name, symbol: contract.symbol ?? contract.name, address: contract.address, imageUrl: contract.imageKey ? `/api/contracts/token/${contract.id}/image` : null }))
}

async function reportContext(tokenAddress: string, workspaceSelection: number | 'all'): Promise<ReportContext | null> {
  const [tokens, scope, config] = await Promise.all([
    listKap22Tokens(workspaceSelection),
    getWorkspaceReportScope(workspaceSelection),
    getReportingConfig(),
  ])
  const normalizedToken = normalizeAddress(tokenAddress)
  const token = tokens.find((candidate) => normalizeAddress(candidate.address) === normalizedToken)
  if (!token) return null
  const addresses = await prisma.addressContract.findMany({
    where: {
      active: true,
      role: { in: ['ZERO', 'DISTRIBUTOR_POOL', 'OPERATION_POOL'] },
      ...(workspaceSelection === 'all' ? {} : { OR: [{ workspaceId: workspaceSelection }, { workspace: { name: 'SYSTEM' } }] }),
    },
    select: { role: true, normalizedAddress: true },
  })
  return {
    token,
    normalizedToken,
    scope,
    historyStart: new Date(config.businessHistoryStart),
    timezone: config.reportingTimezone,
    zeroAddresses: addresses.filter((item) => item.role === 'ZERO').map((item) => item.normalizedAddress),
    distributorAddresses: addresses.filter((item) => item.role === 'DISTRIBUTOR_POOL').map((item) => item.normalizedAddress),
    operationAddresses: addresses.filter((item) => item.role === 'OPERATION_POOL').map((item) => item.normalizedAddress),
  }
}

export async function getKap22Summary(tokenAddress: string, workspaceSelection: number | 'all', options: { includeExpired?: boolean; range?: ReportDateRange } = {}): Promise<Kap22Summary | null> {
  const context = await reportContext(tokenAddress, workspaceSelection)
  if (!context) return null
  const zeroSql = addressSql(context.zeroAddresses)
  const distributorSql = addressSql(context.distributorAddresses)
  const operationSql = addressSql(context.operationAddresses)
  const tokenScopeSql = context.scope.tokenAddresses === null
    ? Prisma.empty
    : Prisma.sql`AND LOWER("tokenAddress") IN (${Prisma.join(context.scope.tokenAddresses)})`
  const reportingDay = reportingDaySql(Prisma.raw('"timestamp"'), context.timezone)
  const expiredBalanceColumn = options.includeExpired ? walletExpiredBalanceColumnForTokenAddress(context.normalizedToken) : null

  const [totals, dailyRows, transactionRows] = await Promise.all([
    prisma.$queryRaw<NumericAggregateRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN LOWER("toHash") = ANY(${distributorSql}) THEN value ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN LOWER("fromHash") = ANY(${distributorSql}) THEN value ELSE 0 END), 0) AS distributor_pool,
        COALESCE(SUM(CASE WHEN LOWER("toHash") = ANY(${operationSql}) THEN value ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN LOWER("fromHash") = ANY(${operationSql}) THEN value ELSE 0 END), 0) AS operation_pool,
        COALESCE(SUM(CASE WHEN LOWER("fromHash") = ANY(${zeroSql}) THEN value ELSE 0 END), 0) AS mint,
        COALESCE(SUM(CASE
          WHEN (
            LOWER("fromHash") = ANY(${distributorSql})
            OR LOWER("fromHash") = ANY(${operationSql})
          )
          -- A user wallet is any destination absent from the complete backend
          -- registry. Deliberately include inactive contracts and every workspace
          -- so legacy/system addresses are never reclassified as users.
          AND NOT EXISTS (
            SELECT 1
            FROM "AddressContract" registered_address
            WHERE registered_address."normalizedAddress" = LOWER("TransactionDetail"."toHash")
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "TokenContract" registered_token
            WHERE registered_token."normalizedAddress" = LOWER("TransactionDetail"."toHash")
          )
          AND NOT (LOWER("TransactionDetail"."toHash") = ANY(${zeroSql}))
          THEN value ELSE 0
        END), 0) AS gross_transfer_to_users,
        COALESCE(SUM(CASE WHEN LOWER("toHash") = ANY(${zeroSql}) THEN value ELSE 0 END), 0) AS burn
      FROM "TransactionDetail"
      WHERE LOWER("tokenAddress") = ${context.normalizedToken}
        AND "timestamp" >= ${context.historyStart}
        ${tokenScopeSql}
    `),
    prisma.$queryRaw<DailyAggregateRow[]>(Prisma.sql`
      SELECT
        ${reportingDay} AS day,
        COUNT(DISTINCT "txId")::bigint AS total_transactions,
        COALESCE(SUM(value), 0) AS total_amount
      FROM "TransactionDetail"
      WHERE LOWER("tokenAddress") = ${context.normalizedToken}
        AND "timestamp" >= ${context.historyStart}
        ${tokenScopeSql}
        AND (
          LOWER("fromHash") = ANY(${distributorSql})
          OR LOWER("fromHash") = ANY(${operationSql})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "AddressContract" registered_address
          WHERE registered_address."normalizedAddress" = LOWER("TransactionDetail"."toHash")
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "TokenContract" registered_token
          WHERE registered_token."normalizedAddress" = LOWER("TransactionDetail"."toHash")
        )
        AND NOT (LOWER("TransactionDetail"."toHash") = ANY(${zeroSql}))
      GROUP BY day
      ORDER BY day ASC
    `),
    prisma.$queryRaw<TotalTransactionRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT header."txId")::bigint AS total_transactions
      FROM "TransactionHeader" header
      INNER JOIN "TransactionDetail" detail ON detail."txId" = header."txId"
      WHERE LOWER(detail."tokenAddress") = ${context.normalizedToken}
        AND header."timestamp" >= ${context.historyStart}
        ${context.scope.tokenAddresses === null
          ? Prisma.empty
          : Prisma.sql`AND LOWER(detail."tokenAddress") IN (${Prisma.join(context.scope.tokenAddresses)})`}
    `),
  ])

  const dailyMap = new Map(dailyRows.map((row) => {
    const key = row.day instanceof Date ? dayKey(row.day, context.timezone) : String(row.day).slice(0, 10)
    return [key, {
      totalTransactions: Number(row.total_transactions),
      totalAmount: decimalString(row.total_amount),
    }]
  }))
  const daily: Kap22DailyPoint[] = []
  const end = dayKey(new Date(), context.timezone)
  let chartPointCount = 0
  for (let current = dayKey(context.historyStart, context.timezone); current <= end; current = addUtcDay(current)) {
    chartPointCount += 1
    if (chartPointCount > MAX_DAILY_CHART_POINTS) {
      throw new Error('Configured business history exceeds the supported chart range')
    }
    const values = dailyMap.get(current)
    daily.push({
      date: current,
      totalTransactions: values?.totalTransactions ?? 0,
      totalAmount: values?.totalAmount ?? '0',
    })
  }
  const total = totals[0]
  const expiredRows = expiredBalanceColumn ? await prisma.$queryRaw<ExpiredBalanceRow[]>(Prisma.sql`
    WITH latest_wallet_snapshots AS (
      SELECT
        wallet.${expiredBalanceColumn} AS expired,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(wallet."walletId")
          ORDER BY wallet."timestamp" DESC NULLS LAST, wallet.id DESC
        ) AS snapshot_rank
      FROM "Wallet" wallet
    )
    SELECT COALESCE(SUM(expired), 0) AS total_expired
    FROM latest_wallet_snapshots
    WHERE snapshot_rank = 1
  `) : []
  const distributorPool = new Prisma.Decimal(decimalString(total?.distributor_pool))
  const operationPool = new Prisma.Decimal(decimalString(total?.operation_pool))
  const mint = new Prisma.Decimal(decimalString(total?.mint))
  const burn = new Prisma.Decimal(decimalString(total?.burn))
  const grossTransferToUsers = new Prisma.Decimal(decimalString(total?.gross_transfer_to_users))
  const transferToUsers = grossTransferToUsers.minus(burn)
  const reconciliationDelta = mint.minus(distributorPool.plus(operationPool).plus(transferToUsers).plus(burn))
  const range = options.range
  const [flowRows, freshness, snapshot] = await Promise.all([
    prisma.$queryRaw<Array<{ mint: Prisma.Decimal; burn: Prisma.Decimal; total_transactions: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(value) FILTER(WHERE LOWER("fromHash")=ANY(${zeroSql})),0) mint,
        COALESCE(SUM(value) FILTER(WHERE LOWER("toHash")=ANY(${zeroSql})),0) burn, COUNT(DISTINCT "txId")::bigint total_transactions
      FROM "TransactionDetail" WHERE LOWER("tokenAddress")=${context.normalizedToken} AND "timestamp">=${range?.start ?? context.historyStart} ${range ? Prisma.sql`AND "timestamp"<${range.end}` : Prisma.empty}
    `),
    prisma.transactionDetail.aggregate({ where: { tokenAddress: { equals: context.normalizedToken, mode: 'insensitive' } }, _max: { timestamp: true } }),
    prisma.wallet.aggregate({ where: { OR: [{ walletId: { in: [...context.distributorAddresses, ...context.operationAddresses], mode: 'insensitive' } }, { walletId: { equals: context.normalizedToken, mode: 'insensitive' } }] }, _max: { timestamp: true } }),
  ])
  const selectedDaily = range ? daily.filter((point) => point.date >= range.from && point.date <= range.to) : daily
  return {
    period: range ? { from: range.from, to: range.to } : undefined,
    dataThrough: freshness._max.timestamp?.toISOString() ?? null,
    snapshotAt: snapshot._max.timestamp?.toISOString() ?? null,
    activity: { mint: decimalString(flowRows[0]?.mint), burn: decimalString(flowRows[0]?.burn), distributed: selectedDaily.reduce((sum, point) => sum.add(point.totalAmount), new Prisma.Decimal(0)).toString(), totalTransactions: Number(flowRows[0]?.total_transactions ?? 0) },
    token: context.token,
    totalTransactions: Number(transactionRows[0]?.total_transactions ?? 0),
    distributorPool: distributorPool.toString(),
    operationPool: operationPool.toString(),
    mint: mint.toString(),
    transferToUsers: transferToUsers.toString(),
    burn: burn.toString(),
    expired: decimalString(expiredRows[0]?.total_expired),
    reconciliationDelta: reconciliationDelta.toString(),
    reconciliationMatched: reconciliationDelta.isZero(),
    daily: selectedDaily,
    timezone: context.timezone,
    historyStart: context.historyStart.toISOString(),
  }
}

export async function getKap22Transactions(tokenAddress: string, workspaceSelection: number | 'all', page: number, limit: number, search = '', range?: ReportDateRange): Promise<{ rows: Kap22TransactionRow[]; total: number; totalPages: number } | null> {
  const context = await reportContext(tokenAddress, workspaceSelection)
  if (!context) return null
  const where: Prisma.TransactionDetailWhereInput = {
    tokenAddress: { equals: context.normalizedToken, mode: 'insensitive' },
    timestamp: { gte: range?.start ?? context.historyStart, ...(range ? { lt: range.end } : {}) },
    ...(context.scope.tokenAddresses === null ? {} : { tokenAddress: { equals: context.normalizedToken, mode: 'insensitive', in: context.scope.tokenAddresses } }),
    ...(search ? {
      OR: [
        { txId: { contains: search, mode: 'insensitive' as const } },
        { fromHash: { contains: search, mode: 'insensitive' as const } },
        { toHash: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.transactionDetail.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { key: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, key: true, txId: true, timestamp: true, fromHash: true, toHash: true,
        tokenAddress: true, tokenName: true, tokenSymbol: true, tokenType: true, value: true,
        header: { select: { status: true } },
      },
    }),
    prisma.transactionDetail.count({ where }),
  ])
  const normalizedAddresses = Array.from(new Set(items.flatMap((item) => [normalizeAddress(item.fromHash), normalizeAddress(item.toHash)])))
  const registeredAddresses = normalizedAddresses.length === 0 ? [] : await prisma.addressContract.findMany({
    // Display names in this report must come from the authoritative SYSTEM
    // registry. A workspace-local label must not silently rename the same
    // blockchain address in an all-workspace audit view.
    where: {
      normalizedAddress: { in: normalizedAddresses },
      workspace: { name: 'SYSTEM' },
    },
    select: { normalizedAddress: true, name: true },
  })
  const addressNames = new Map(registeredAddresses.map((item) => [item.normalizedAddress, item.name]))
  const zeroSet = new Set(context.zeroAddresses)
  return {
    rows: items.map((item) => {
      const from = normalizeAddress(item.fromHash)
      const to = normalizeAddress(item.toHash)
      const type: Kap22TransactionType = zeroSet.has(from) ? 'Mint' : zeroSet.has(to) ? 'Burn' : 'Transfer'
      return {
        id: item.id,
        key: item.key,
        txId: item.txId,
        timestamp: item.timestamp.toISOString(),
        type,
        flow: classifyFlow(item),
        status: item.header.status,
        tokenName: item.tokenName,
        tokenSymbol: item.tokenSymbol,
        fromHash: item.fromHash,
        fromName: addressNames.get(from) ?? null,
        toHash: item.toHash,
        toName: addressNames.get(to) ?? null,
        value: item.value.toString(),
      }
    }),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function getKap22TopUsers(tokenAddress: string, workspaceSelection: number | 'all', range?: ReportDateRange): Promise<Kap22TopUsers | null> {
  const context = await reportContext(tokenAddress, workspaceSelection)
  if (!context) return null
  const poolSql = addressSql([...context.distributorAddresses, ...context.operationAddresses])
  const balanceColumn = walletBalanceColumnForTokenAddress(context.normalizedToken)
  const tokenScopeSql = context.scope.tokenAddresses === null
    ? Prisma.empty
    : Prisma.sql`AND LOWER(detail."tokenAddress") IN (${Prisma.join(context.scope.tokenAddresses)})`

  const [receivedRows, balanceRows] = await Promise.all([
    prisma.$queryRaw<TopUserRow[]>(Prisma.sql`
      WITH registered_wallets AS (
        SELECT LOWER("normalizedAddress") AS "normalizedAddress" FROM "AddressContract"
        UNION
        SELECT LOWER("normalizedAddress") AS "normalizedAddress" FROM "TokenContract"
      )
      SELECT
        (ARRAY_AGG(detail."toHash" ORDER BY detail."timestamp" DESC NULLS LAST, detail.id DESC))[1] AS wallet_address,
        SUM(detail.value) AS amount
      FROM "TransactionDetail" detail
      WHERE LOWER(detail."tokenAddress") = ${context.normalizedToken}
        AND detail."timestamp" >= ${range?.start ?? context.historyStart}
        ${range ? Prisma.sql`AND detail."timestamp" < ${range.end}` : Prisma.empty}
        ${tokenScopeSql}
        AND LOWER(detail."fromHash") = ANY(${poolSql})
        AND NOT EXISTS (
          SELECT 1 FROM registered_wallets registry
          WHERE registry."normalizedAddress" = LOWER(detail."toHash")
        )
      GROUP BY LOWER(detail."toHash")
      ORDER BY amount DESC, LOWER(detail."toHash") ASC
      LIMIT 10
    `),
    prisma.$queryRaw<TopUserRow[]>(Prisma.sql`
      WITH registered_wallets AS (
        SELECT LOWER("normalizedAddress") AS "normalizedAddress" FROM "AddressContract"
        UNION
        SELECT LOWER("normalizedAddress") AS "normalizedAddress" FROM "TokenContract"
      ), latest_wallet_snapshots AS (
        SELECT
          wallet."walletId" AS wallet_address,
          LOWER(wallet."walletId") AS normalized_address,
          wallet.${balanceColumn} AS amount,
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
          SELECT 1 FROM registered_wallets registry
          WHERE registry."normalizedAddress" = snapshot.normalized_address
        )
      ORDER BY snapshot.amount DESC, snapshot.normalized_address ASC
      LIMIT 10
    `),
  ])

  const mapRows = (rows: TopUserRow[]): Kap22TopUser[] => rows.map((row) => ({
    walletAddress: row.wallet_address,
    amount: decimalString(row.amount),
  }))
  return { token: context.token, topReceived: mapRows(receivedRows), topBalances: mapRows(balanceRows) }
}
