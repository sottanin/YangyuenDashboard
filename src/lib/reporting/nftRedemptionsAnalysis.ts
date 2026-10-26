import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeAddress } from '@/lib/system/addresses'
import { getReportingConfig } from '@/lib/system/config'
import type { ReportDateRange } from './reportPeriod'

interface TopNftRow {
  name: string
  total: bigint
  token_address: string
  token_id: string
}
interface NftCountRow { mint: bigint; burn: bigint }
interface NftTransactionSqlRow {
  id: string; key: string; tx_id: string; timestamp: Date; from_hash: string; to_hash: string
  token_address: string; token_name: string; token_symbol: string; token_id: string | null; status: string | null
}
interface CountRow { total: bigint }

export class InvalidReportTokenError extends Error {}

function nftArtworkUrl(workspace: number | 'all', tokenAddress: string, tokenId: string): string {
  const params = new URLSearchParams({ workspace: String(workspace), contract: tokenAddress, tokenId })
  return `/api/reports/nft-redemptions/image?${params.toString()}`
}

function nftRegistryImageUrl(workspace: number | 'all', tokenAddress: string): string {
  const params = new URLSearchParams({ workspace: String(workspace), contract: tokenAddress })
  return `/api/reports/nft-redemptions/image?${params.toString()}`
}

function addressArray(values: string[]): Prisma.Sql {
  return values.length > 0
    ? Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`
    : Prisma.sql`ARRAY[]::text[]`
}

async function reportContext(workspace: number | 'all', tokenAddress?: string) {
  const workspaceWhere = workspace === 'all' ? {} : { workspaceId: workspace }
  const nftWorkspaceWhere = workspace === 'all'
    ? {}
    : { OR: [{ workspaceId: workspace }, { aggregateAcrossWorkspaces: true }] }
  const addressWorkspaceWhere = workspace === 'all'
    ? {}
    : { OR: [{ workspaceId: workspace }, { workspace: { name: 'SYSTEM' } }, { role: 'MARKETPLACE', aggregateAcrossWorkspaces: true }] }

  const [config, nftContracts, allKap20Contracts, addresses, allAddressContracts, allTokenContracts] = await Promise.all([
    getReportingConfig(),
    prisma.tokenContract.findMany({
      where: { standard: 'KAP-721', active: true, ...nftWorkspaceWhere },
      select: { id: true, workspaceId: true, normalizedAddress: true, symbol: true, name: true, imageKey: true },
      orderBy: { normalizedAddress: 'asc' },
    }),
    prisma.tokenContract.findMany({
      where: { standard: 'KAP-20', role: 'PRIMARY_TOKEN', active: true, ...workspaceWhere },
      select: { id: true, normalizedAddress: true, symbol: true, imageKey: true },
      orderBy: { normalizedAddress: 'asc' },
    }),
    prisma.addressContract.findMany({
      where: { role: { in: ['ZERO', 'MARKETPLACE', 'MARKETPLACE_FEE'] }, active: true, ...addressWorkspaceWhere },
      select: { role: true, normalizedAddress: true },
    }),
    prisma.addressContract.findMany({ select: { address: true } }),
    prisma.tokenContract.findMany({ select: { address: true } }),
  ])

  const localNft = workspace === 'all' ? undefined : nftContracts.find((contract) => contract.workspaceId === workspace)
  const displayNft = localNft ?? nftContracts[0]
  const imageNft = (localNft?.imageKey ? localNft : undefined) ?? nftContracts.find((contract) => contract.imageKey)
  const kap20Contracts = tokenAddress
    ? allKap20Contracts.filter((contract) => contract.normalizedAddress === normalizeAddress(tokenAddress))
    : allKap20Contracts
  if (tokenAddress && kap20Contracts.length === 0) throw new InvalidReportTokenError('Select an active KAP-20 token for this workspace')

  return {
    nftAddresses: nftContracts.map((contract) => contract.normalizedAddress),
    nftSymbol: displayNft?.symbol ?? displayNft?.name ?? 'NFT',
    nftImageUrl: imageNft ? nftRegistryImageUrl(workspace, imageNft.normalizedAddress) : null,
    kap20Addresses: kap20Contracts.map((contract) => contract.normalizedAddress),
    selectedKap20Address: kap20Contracts[0]?.normalizedAddress ?? '',
    kap20Symbol: kap20Contracts[0]?.symbol ?? 'KAP-20',
    kap20ImageUrl: kap20Contracts[0]?.imageKey ? `/api/contracts/token/${kap20Contracts[0].id}/image` : null,
    requireTokenAssociation: allKap20Contracts.length > 1,
    historyStart: new Date(config.businessHistoryStart),
    timezone: config.reportingTimezone,
    zeroAddresses: addresses.filter((address) => address.role === 'ZERO').map((address) => address.normalizedAddress),
    marketplaceAddresses: addresses.filter((address) => address.role === 'MARKETPLACE').map((address) => address.normalizedAddress),
    feeAddresses: addresses.filter((address) => address.role === 'MARKETPLACE_FEE').map((address) => address.normalizedAddress),
    registeredAddresses: [...allAddressContracts, ...allTokenContracts].map((entry) => normalizeAddress(entry.address)),
  }
}

function nftTokenAssociation(context: Awaited<ReturnType<typeof reportContext>>, detailAlias: string): Prisma.Sql {
  if (!context.requireTokenAssociation) return Prisma.empty
  const detail = Prisma.raw(detailAlias)
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM "RedemptionTransactionDetail" mint
    JOIN "TransactionDetail" payment ON payment."txId"=mint."txId"
    WHERE LOWER(mint."tokenAddress")=LOWER(${detail}."tokenAddress") AND mint."tokenId"=${detail}."tokenId"
      AND LOWER(mint."fromHash")=ANY(${addressArray(context.zeroAddresses)})
      AND LOWER(payment."tokenAddress")=${context.selectedKap20Address}
      AND LOWER(payment."toHash")=ANY(${addressArray(context.marketplaceAddresses)})
      AND NOT(LOWER(payment."fromHash")=ANY(${addressArray(context.registeredAddresses)}))
  )`
}

export async function listNftReportTokens(workspace: number | 'all') {
  const tokens = await prisma.tokenContract.findMany({
    where: { standard: 'KAP-20', role: 'PRIMARY_TOKEN', active: true, ...(workspace === 'all' ? {} : { workspaceId: workspace }) },
    select: { id: true, name: true, symbol: true, address: true, imageKey: true },
    orderBy: [{ name: 'asc' }, { normalizedAddress: 'asc' }],
  })
  return tokens.map((token) => ({ id: token.id, name: token.name, symbol: token.symbol ?? token.name, address: token.address, imageUrl: token.imageKey ? `/api/contracts/token/${token.id}/image` : null }))
}

export async function getNftRedemptionsSummary(workspace: number | 'all', tokenAddress: string, range: ReportDateRange) {
  const context = await reportContext(workspace, tokenAddress)
  if (context.nftAddresses.length === 0) {
    return { nftMint: 0, nftBurn: 0, nftSymbol: context.nftSymbol, nftImageUrl: context.nftImageUrl, kap20Burn: '0', kap20Fee: '0', kap20Symbol: context.kap20Symbol, kap20ImageUrl: context.kap20ImageUrl, timezone: context.timezone }
  }

  const fromUserWallet = {
    NOT: {
      fromHash: { in: context.registeredAddresses, mode: 'insensitive' as const },
    },
  }
  const [nftCounts, kap20Burn, kap20Fee] = await Promise.all([
    prisma.$queryRaw<NftCountRow[]>(Prisma.sql`
      WITH scoped AS (
        SELECT detail.* FROM "RedemptionTransactionDetail" detail
        WHERE LOWER(detail."tokenAddress")=ANY(${addressArray(context.nftAddresses)})
          AND detail."timestamp">=${range.start} AND detail."timestamp"<${range.end}
          ${nftTokenAssociation(context, 'detail')}
      )
      SELECT COUNT(*) FILTER (WHERE LOWER("fromHash")=ANY(${addressArray(context.zeroAddresses)}) AND NOT(LOWER("toHash")=ANY(${addressArray(context.registeredAddresses)})))::bigint mint,
        COUNT(*) FILTER (WHERE LOWER("toHash")=ANY(${addressArray(context.zeroAddresses)}) AND NOT(LOWER("fromHash")=ANY(${addressArray(context.registeredAddresses)})))::bigint burn
      FROM scoped
    `),
    prisma.transactionDetail.aggregate({
      where: {
        tokenAddress: { in: context.kap20Addresses, mode: 'insensitive' },
        timestamp: { gte: range.start, lt: range.end },
        toHash: { in: context.marketplaceAddresses, mode: 'insensitive' },
        ...fromUserWallet,
      },
      _sum: { value: true },
    }),
    prisma.transactionDetail.aggregate({
      where: {
        tokenAddress: { in: context.kap20Addresses, mode: 'insensitive' },
        timestamp: { gte: range.start, lt: range.end },
        fromHash: { in: context.marketplaceAddresses, mode: 'insensitive' },
        toHash: { in: context.feeAddresses, mode: 'insensitive' },
      },
      _sum: { value: true },
    }),
  ])

  const grossKap20Burn = kap20Burn._sum.value ?? new Prisma.Decimal(0)
  const totalKap20Fee = kap20Fee._sum.value ?? new Prisma.Decimal(0)
  const netKap20Burn = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    grossKap20Burn.sub(totalKap20Fee),
  )

  const nftCount = nftCounts[0] ?? { mint: BigInt(0), burn: BigInt(0) }
  return {
    nftMint: Number(nftCount.mint),
    nftBurn: Number(nftCount.burn),
    nftSymbol: context.nftSymbol,
    nftImageUrl: context.nftImageUrl,
    kap20Burn: netKap20Burn.toString(),
    kap20Fee: totalKap20Fee.toString(),
    kap20Symbol: context.kap20Symbol,
    kap20ImageUrl: context.kap20ImageUrl,
    timezone: context.timezone,
  }
}

export async function getTopNftRedemptions(workspace: number | 'all', tokenAddress: string, range: ReportDateRange) {
  if (workspace === 'all') return []
  const context = await reportContext(workspace, tokenAddress)
  if (context.nftAddresses.length === 0) return []
  const rows = await prisma.$queryRaw<TopNftRow[]>(Prisma.sql`
    WITH minted_instances AS (
      SELECT DISTINCT ON (LOWER(detail."tokenAddress"), detail."tokenId")
        LOWER(detail."tokenAddress") AS token_address, detail."tokenId" AS token_id,
        detail."tokenName" AS token_name
      FROM "RedemptionTransactionDetail" detail
      WHERE LOWER(detail."tokenAddress") = ANY(${addressArray(context.nftAddresses)})
        AND LOWER(detail."fromHash") = ANY(${addressArray(context.zeroAddresses)})
        AND detail."timestamp" >= ${range.start}
        AND detail."timestamp" < ${range.end}
        AND detail."tokenId" IS NOT NULL
        ${nftTokenAssociation(context, 'detail')}
        AND NOT EXISTS (
          SELECT 1 FROM "AddressContract" address_registry
          WHERE address_registry."normalizedAddress" = LOWER(detail."toHash")
        )
        AND NOT EXISTS (
          SELECT 1 FROM "TokenContract" token_registry
          WHERE token_registry."normalizedAddress" = LOWER(detail."toHash")
        )
      ORDER BY LOWER(detail."tokenAddress"), detail."tokenId", detail."timestamp" DESC, detail.key DESC
    )
    SELECT COALESCE(NULLIF(instance.name, ''), NULLIF(minted.token_name, ''), 'Unknown NFT') AS name,
      COUNT(*)::bigint AS total,
      (ARRAY_AGG(minted.token_address ORDER BY (instance."imageUrl" IS NOT NULL) DESC, minted.token_address, minted.token_id))[1] AS token_address,
      (ARRAY_AGG(minted.token_id ORDER BY (instance."imageUrl" IS NOT NULL) DESC, minted.token_address, minted.token_id))[1] AS token_id
    FROM minted_instances minted
    LEFT JOIN "NFTInstance" instance
      ON instance."normalizedTokenAddress" = minted.token_address
      AND instance.id = minted.token_id
    GROUP BY COALESCE(NULLIF(instance.name, ''), NULLIF(minted.token_name, ''), 'Unknown NFT')
    ORDER BY total DESC, name ASC
    LIMIT 10
  `)
  return rows.map((row) => ({
    name: row.name,
    imageUrl: nftArtworkUrl(workspace, row.token_address, row.token_id),
    total: Number(row.total),
  }))
}

export async function getTopNftBurns(workspace: number | 'all', tokenAddress: string, range: ReportDateRange) {
  if (workspace === 'all') return []
  const context = await reportContext(workspace, tokenAddress)
  if (context.nftAddresses.length === 0) return []
  const rows = await prisma.$queryRaw<TopNftRow[]>(Prisma.sql`
    WITH burned_instances AS (
      SELECT DISTINCT ON (LOWER(detail."tokenAddress"), detail."tokenId") detail."tokenId" AS token_id,
        LOWER(detail."tokenAddress") AS token_address,
        detail."tokenName" AS token_name
      FROM "RedemptionTransactionDetail" detail
      WHERE LOWER(detail."tokenAddress") = ANY(${addressArray(context.nftAddresses)})
        AND LOWER(detail."toHash") = ANY(${addressArray(context.zeroAddresses)})
        AND detail."timestamp" >= ${range.start}
        AND detail."timestamp" < ${range.end}
        AND detail."tokenId" IS NOT NULL
        ${nftTokenAssociation(context, 'detail')}
        AND NOT EXISTS (
          SELECT 1 FROM "AddressContract" address_registry
          WHERE address_registry."normalizedAddress" = LOWER(detail."fromHash")
        )
        AND NOT EXISTS (
          SELECT 1 FROM "TokenContract" token_registry
          WHERE token_registry."normalizedAddress" = LOWER(detail."fromHash")
        )
      ORDER BY LOWER(detail."tokenAddress"), detail."tokenId", detail."timestamp" DESC, detail.key DESC
    )
    SELECT COALESCE(NULLIF(instance.name, ''), NULLIF(burned.token_name, ''), 'Unknown NFT') AS name,
      COUNT(*)::bigint AS total,
      (ARRAY_AGG(burned.token_address ORDER BY (instance."imageUrl" IS NOT NULL) DESC, burned.token_address, burned.token_id))[1] AS token_address,
      (ARRAY_AGG(burned.token_id ORDER BY (instance."imageUrl" IS NOT NULL) DESC, burned.token_address, burned.token_id))[1] AS token_id
    FROM burned_instances burned
    LEFT JOIN "NFTInstance" instance
      ON instance."normalizedTokenAddress" = burned.token_address
      AND instance.id = burned.token_id
    GROUP BY COALESCE(NULLIF(instance.name, ''), NULLIF(burned.token_name, ''), 'Unknown NFT')
    ORDER BY total DESC, name ASC
    LIMIT 10
  `)
  return rows.map((row) => ({
    name: row.name,
    imageUrl: nftArtworkUrl(workspace, row.token_address, row.token_id),
    total: Number(row.total),
  }))
}

export async function getNftRedemptionTransactions(
  workspace: number | 'all',
  page: number,
  limit: number,
  search = '',
  tokenAddress: string,
  range: ReportDateRange,
) {
  const context = await reportContext(workspace, tokenAddress)
  const pattern = `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  const searchSql = search ? Prisma.sql`AND (detail."txId" ILIKE ${pattern} ESCAPE '\\' OR detail."fromHash" ILIKE ${pattern} ESCAPE '\\' OR detail."toHash" ILIKE ${pattern} ESCAPE '\\' OR COALESCE(detail."tokenId",'') ILIKE ${pattern} ESCAPE '\\' OR detail."tokenName" ILIKE ${pattern} ESCAPE '\\')` : Prisma.empty
  const scopeSql = Prisma.sql`
    LOWER(detail."tokenAddress")=ANY(${addressArray(context.nftAddresses)})
    AND detail."timestamp">=${range.start} AND detail."timestamp"<${range.end}
    ${nftTokenAssociation(context, 'detail')} ${searchSql}`
  const offset = (page - 1) * limit
  const [items, countRows, addressRegistry, tokenRegistry] = await Promise.all([
    prisma.$queryRaw<NftTransactionSqlRow[]>(Prisma.sql`
      SELECT detail.id,detail.key,detail."txId" tx_id,detail."timestamp",detail."fromHash" from_hash,detail."toHash" to_hash,
        LOWER(detail."tokenAddress") token_address,detail."tokenName" token_name,detail."tokenSymbol" token_symbol,detail."tokenId" token_id,header.status
      FROM "RedemptionTransactionDetail" detail JOIN "RedemptionTransactionHeader" header USING("txId")
      WHERE ${scopeSql} ORDER BY detail."timestamp" DESC,detail.key DESC OFFSET ${offset} LIMIT ${limit}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint total FROM "RedemptionTransactionDetail" detail WHERE ${scopeSql}`),
    prisma.addressContract.findMany({ select: { normalizedAddress: true, name: true } }),
    prisma.tokenContract.findMany({ select: { normalizedAddress: true, name: true } }),
  ])
  const total = Number(countRows[0]?.total ?? BigInt(0))
  const names = new Map<string, string>([
    ...addressRegistry.map((entry) => [entry.normalizedAddress, entry.name] as const),
    ...tokenRegistry.map((entry) => [entry.normalizedAddress, entry.name] as const),
  ])
  const tokenIds = Array.from(new Set(items.flatMap((item) => item.token_id ? [item.token_id] : [])))
  const nftInstances = tokenIds.length === 0 ? [] : await prisma.nFTInstance.findMany({
    where: { normalizedTokenAddress: { in: context.nftAddresses }, id: { in: tokenIds } },
    select: { normalizedTokenAddress: true, id: true, name: true, tokenValue: true },
  })
  const nftNames = new Map(nftInstances.map((instance) => [`${instance.normalizedTokenAddress}:${instance.id}`, instance.name]))
  const nftValues = new Map(nftInstances.map((instance) => [`${instance.normalizedTokenAddress}:${instance.id}`, instance.tokenValue?.toString() ?? null]))
  const zero = new Set(context.zeroAddresses)

  return {
    rows: items.map((item) => ({
      id: item.id,
      txId: item.tx_id,
      timestamp: item.timestamp.toISOString(),
      type: zero.has(normalizeAddress(item.from_hash)) ? 'Mint' : zero.has(normalizeAddress(item.to_hash)) ? 'Burn' : 'Transfer',
      status: item.status,
      tokenName: item.token_id ? nftNames.get(`${item.token_address}:${item.token_id}`) ?? item.token_name : item.token_name,
      tokenSymbol: item.token_symbol,
      tokenId: item.token_id,
      tokenValue: item.token_id ? nftValues.get(`${item.token_address}:${item.token_id}`) ?? null : null,
      imageUrl: item.token_id ? nftArtworkUrl(workspace, item.token_address, item.token_id) : null,
      fromHash: item.from_hash,
      fromName: names.get(normalizeAddress(item.from_hash)) ?? null,
      toHash: item.to_hash,
      toName: names.get(normalizeAddress(item.to_hash)) ?? null,
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

/** Event history and current lifecycle are deliberately separate populations. */
export async function getNftRedemptionInsights(workspace: number | 'all', tokenAddress: string, range: ReportDateRange) {
  const context = await reportContext(workspace, tokenAddress)
  const monthly = (range.end.getTime() - range.start.getTime()) / 86_400_000 > 90
  const [trendRows, lifecycleRows] = await Promise.all([
    prisma.$queryRaw<Array<{ bucket: string; issued: bigint; used: bigint }>>(Prisma.sql`
      SELECT TO_CHAR(d."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${context.timezone},${monthly ? 'YYYY-MM' : 'YYYY-MM-DD'}) bucket,
        COUNT(*) FILTER(WHERE LOWER(d."fromHash")=ANY(${addressArray(context.zeroAddresses)}) AND NOT(LOWER(d."toHash")=ANY(${addressArray(context.registeredAddresses)})))::bigint issued,
        COUNT(*) FILTER(WHERE LOWER(d."toHash")=ANY(${addressArray(context.zeroAddresses)}) AND NOT(LOWER(d."fromHash")=ANY(${addressArray(context.registeredAddresses)})))::bigint used
      FROM "RedemptionTransactionDetail" d WHERE LOWER(d."tokenAddress")=ANY(${addressArray(context.nftAddresses)}) AND d."timestamp">=${range.start} AND d."timestamp"<${range.end} ${nftTokenAssociation(context, 'd')}
      GROUP BY bucket ORDER BY bucket
    `),
    prisma.$queryRaw<Array<{ active: bigint; used: bigint; unknown: bigint; data_through: Date | null }>>(Prisma.sql`
      WITH issued AS (
        SELECT DISTINCT LOWER(d."tokenAddress") token_address,d."tokenId" token_id FROM "RedemptionTransactionDetail" d
        WHERE LOWER(d."tokenAddress")=ANY(${addressArray(context.nftAddresses)}) AND LOWER(d."fromHash")=ANY(${addressArray(context.zeroAddresses)}) AND NOT(LOWER(d."toHash")=ANY(${addressArray(context.registeredAddresses)})) AND d."tokenId" IS NOT NULL AND d."timestamp">=${context.historyStart} ${nftTokenAssociation(context, 'd')}
      ),latest AS (
        SELECT DISTINCT ON (LOWER(d."tokenAddress"),d."tokenId") LOWER(d."tokenAddress") token_address,d."tokenId" token_id,LOWER(d."toHash") owner,d."timestamp"
        FROM "RedemptionTransactionDetail" d JOIN issued i ON i.token_address=LOWER(d."tokenAddress") AND i.token_id=d."tokenId"
        ORDER BY LOWER(d."tokenAddress"),d."tokenId",d."timestamp" DESC,d.key DESC
      ) SELECT COUNT(*) FILTER(WHERE owner ~ '^0x[0-9a-f]{40}$' AND NOT(owner=ANY(${addressArray(context.registeredAddresses)})) AND NOT(owner=ANY(${addressArray(context.zeroAddresses)})))::bigint active,
        COUNT(*) FILTER(WHERE owner=ANY(${addressArray(context.zeroAddresses)}))::bigint used,
        COUNT(*) FILTER(WHERE NOT(owner ~ '^0x[0-9a-f]{40}$') OR (owner=ANY(${addressArray(context.registeredAddresses)}) AND NOT(owner=ANY(${addressArray(context.zeroAddresses)}))))::bigint unknown,
        MAX("timestamp") data_through FROM latest
    `),
  ])
  const start = new Date(`${range.from}T00:00:00Z`); const last = new Date(`${range.to}T00:00:00Z`)
  const buckets: string[] = []
  if (monthly) { start.setUTCDate(1); last.setUTCDate(1) }
  while (start <= last && buckets.length < 36_600) { buckets.push(start.toISOString().slice(0, monthly ? 7 : 10)); if (monthly) start.setUTCMonth(start.getUTCMonth() + 1); else start.setUTCDate(start.getUTCDate() + 1) }
  const byBucket = new Map(trendRows.map((row) => [row.bucket, row])); const inventory = lifecycleRows[0]
  return { trend: buckets.map((bucket) => ({ label: bucket, issued: Number(byBucket.get(bucket)?.issued ?? 0), used: Number(byBucket.get(bucket)?.used ?? 0) })), currentInventory: { active: Number(inventory?.active ?? 0), used: Number(inventory?.used ?? 0), unknown: Number(inventory?.unknown ?? 0) }, dataThrough: inventory?.data_through?.toISOString() ?? null }
}
