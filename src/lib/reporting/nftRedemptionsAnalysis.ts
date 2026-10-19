import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeAddress } from '@/lib/system/addresses'
import { getReportingConfig } from '@/lib/system/config'

interface TopNftRow {
  name: string
  total: bigint
  token_address: string
  token_id: string
}

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

async function reportContext(workspace: number | 'all') {
  const workspaceWhere = workspace === 'all' ? {} : { workspaceId: workspace }
  const nftWorkspaceWhere = workspace === 'all'
    ? {}
    : { OR: [{ workspaceId: workspace }, { aggregateAcrossWorkspaces: true }] }
  const addressWorkspaceWhere = workspace === 'all'
    ? {}
    : { OR: [{ workspaceId: workspace }, { workspace: { name: 'SYSTEM' } }, { role: 'MARKETPLACE', aggregateAcrossWorkspaces: true }] }

  const [config, nftContracts, kap20Contracts, addresses, allAddressContracts, allTokenContracts] = await Promise.all([
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

  return {
    nftAddresses: nftContracts.map((contract) => contract.normalizedAddress),
    nftSymbol: displayNft?.symbol ?? displayNft?.name ?? 'NFT',
    nftImageUrl: imageNft ? nftRegistryImageUrl(workspace, imageNft.normalizedAddress) : null,
    kap20Addresses: kap20Contracts.map((contract) => contract.normalizedAddress),
    kap20Symbol: kap20Contracts[0]?.symbol ?? 'KAP-20',
    kap20ImageUrl: kap20Contracts[0]?.imageKey ? `/api/contracts/token/${kap20Contracts[0].id}/image` : null,
    historyStart: new Date(config.businessHistoryStart),
    timezone: config.reportingTimezone,
    zeroAddresses: addresses.filter((address) => address.role === 'ZERO').map((address) => address.normalizedAddress),
    marketplaceAddresses: addresses.filter((address) => address.role === 'MARKETPLACE').map((address) => address.normalizedAddress),
    feeAddresses: addresses.filter((address) => address.role === 'MARKETPLACE_FEE').map((address) => address.normalizedAddress),
    registeredAddresses: [...allAddressContracts, ...allTokenContracts].map((entry) => entry.address),
  }
}

export async function getNftRedemptionsSummary(workspace: number | 'all') {
  const context = await reportContext(workspace)
  if (context.nftAddresses.length === 0) {
    return { nftMint: 0, nftBurn: 0, nftSymbol: context.nftSymbol, nftImageUrl: context.nftImageUrl, kap20Burn: '0', kap20Fee: '0', kap20Symbol: context.kap20Symbol, kap20ImageUrl: context.kap20ImageUrl, timezone: context.timezone }
  }

  const fromUserWallet = {
    NOT: {
      fromHash: { in: context.registeredAddresses, mode: 'insensitive' as const },
    },
  }
  const toUserWallet = { NOT: { toHash: { in: context.registeredAddresses, mode: 'insensitive' as const } } }
  const nftScope = { tokenAddress: { in: context.nftAddresses, mode: 'insensitive' as const } }

  const [nftMint, nftBurn, kap20Burn, kap20Fee] = await Promise.all([
    prisma.redemptionTransactionDetail.count({
      where: { ...nftScope, timestamp: { gte: context.historyStart }, fromHash: { in: context.zeroAddresses, mode: 'insensitive' }, ...toUserWallet },
    }),
    prisma.redemptionTransactionDetail.count({
      where: { ...nftScope, timestamp: { gte: context.historyStart }, toHash: { in: context.zeroAddresses, mode: 'insensitive' }, ...fromUserWallet },
    }),
    prisma.transactionDetail.aggregate({
      where: {
        tokenAddress: { in: context.kap20Addresses, mode: 'insensitive' },
        timestamp: { gte: context.historyStart },
        toHash: { in: context.marketplaceAddresses, mode: 'insensitive' },
        ...fromUserWallet,
      },
      _sum: { value: true },
    }),
    prisma.transactionDetail.aggregate({
      where: {
        tokenAddress: { in: context.kap20Addresses, mode: 'insensitive' },
        timestamp: { gte: context.historyStart },
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

  return {
    nftMint,
    nftBurn,
    nftSymbol: context.nftSymbol,
    nftImageUrl: context.nftImageUrl,
    kap20Burn: netKap20Burn.toString(),
    kap20Fee: totalKap20Fee.toString(),
    kap20Symbol: context.kap20Symbol,
    kap20ImageUrl: context.kap20ImageUrl,
    timezone: context.timezone,
  }
}

export async function getTopNftRedemptions(workspace: number | 'all') {
  if (workspace === 'all') return []
  const context = await reportContext(workspace)
  if (context.nftAddresses.length === 0) return []
  const rows = await prisma.$queryRaw<TopNftRow[]>(Prisma.sql`
    WITH minted_instances AS (
      SELECT DISTINCT ON (LOWER(detail."tokenAddress"), detail."tokenId")
        LOWER(detail."tokenAddress") AS token_address, detail."tokenId" AS token_id,
        detail."tokenName" AS token_name
      FROM "RedemptionTransactionDetail" detail
      WHERE LOWER(detail."tokenAddress") = ANY(${addressArray(context.nftAddresses)})
        AND LOWER(detail."fromHash") = ANY(${addressArray(context.zeroAddresses)})
        AND detail."timestamp" >= ${context.historyStart}
        AND detail."tokenId" IS NOT NULL
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

export async function getTopNftBurns(workspace: number | 'all') {
  if (workspace === 'all') return []
  const context = await reportContext(workspace)
  if (context.nftAddresses.length === 0) return []
  const rows = await prisma.$queryRaw<TopNftRow[]>(Prisma.sql`
    WITH burned_instances AS (
      SELECT DISTINCT ON (LOWER(detail."tokenAddress"), detail."tokenId") detail."tokenId" AS token_id,
        LOWER(detail."tokenAddress") AS token_address,
        detail."tokenName" AS token_name
      FROM "RedemptionTransactionDetail" detail
      WHERE LOWER(detail."tokenAddress") = ANY(${addressArray(context.nftAddresses)})
        AND LOWER(detail."toHash") = ANY(${addressArray(context.zeroAddresses)})
        AND detail."timestamp" >= ${context.historyStart}
        AND detail."tokenId" IS NOT NULL
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
) {
  const context = await reportContext(workspace)
  const where: Prisma.RedemptionTransactionDetailWhereInput = {
    tokenAddress: { in: context.nftAddresses, mode: 'insensitive' },
    timestamp: { gte: context.historyStart },
    ...(search ? {
      OR: [
        { txId: { contains: search, mode: 'insensitive' } },
        { fromHash: { contains: search, mode: 'insensitive' } },
        { toHash: { contains: search, mode: 'insensitive' } },
        { tokenId: { contains: search, mode: 'insensitive' } },
        { tokenName: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  }
  const [items, total, addressRegistry, tokenRegistry] = await Promise.all([
    prisma.redemptionTransactionDetail.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { key: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: { header: { select: { status: true } } },
    }),
    prisma.redemptionTransactionDetail.count({ where }),
    prisma.addressContract.findMany({ select: { normalizedAddress: true, name: true } }),
    prisma.tokenContract.findMany({ select: { normalizedAddress: true, name: true } }),
  ])
  const names = new Map<string, string>([
    ...addressRegistry.map((entry) => [entry.normalizedAddress, entry.name] as const),
    ...tokenRegistry.map((entry) => [entry.normalizedAddress, entry.name] as const),
  ])
  const tokenIds = Array.from(new Set(items.flatMap((item) => item.tokenId ? [item.tokenId] : [])))
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
      txId: item.txId,
      timestamp: item.timestamp.toISOString(),
      type: zero.has(normalizeAddress(item.fromHash)) ? 'Mint' : zero.has(normalizeAddress(item.toHash)) ? 'Burn' : 'Transfer',
      status: item.header.status,
      tokenName: item.tokenId ? nftNames.get(`${normalizeAddress(item.tokenAddress)}:${item.tokenId}`) ?? item.tokenName : item.tokenName,
      tokenSymbol: item.tokenSymbol,
      tokenId: item.tokenId,
      tokenValue: item.tokenId ? nftValues.get(`${normalizeAddress(item.tokenAddress)}:${item.tokenId}`) ?? null : null,
      imageUrl: item.tokenId ? nftArtworkUrl(workspace, item.tokenAddress, item.tokenId) : null,
      fromHash: item.fromHash,
      fromName: names.get(normalizeAddress(item.fromHash)) ?? null,
      toHash: item.toHash,
      toName: names.get(normalizeAddress(item.toHash)) ?? null,
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
