import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getReportingConfig } from '@/lib/system/config'

const PAGE_SIZE = 25

interface ActivitySqlRow {
  name: string
  purchase_count: bigint
  redeem_count: bigint
  token_address: string
  token_id: string
}

interface VoucherSqlRow {
  token_address: string
  token_id: string
  name: string
  owner_hash: string
  detail_th: string | null
  purchase_wallet: string
  purchase_at: Date
  used_at: Date | null
}

interface CountSqlRow { total: bigint }

function addressArray(values: string[]): Prisma.Sql {
  return values.length > 0
    ? Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`
    : Prisma.sql`ARRAY[]::text[]`
}

async function voucherContext(workspaceId: number): Promise<{
  nftAddresses: string[]
  zeroAddresses: string[]
  registeredAddresses: string[]
  timezone: string
}> {
  const [contracts, zeroAddresses, allAddressContracts, allTokenContracts, config] = await Promise.all([
    prisma.tokenContract.findMany({
      where: {
        standard: 'KAP-721',
        active: true,
        OR: [{ workspaceId }, { aggregateAcrossWorkspaces: true }],
      },
      select: { normalizedAddress: true },
    }),
    prisma.addressContract.findMany({
      where: {
        role: 'ZERO',
        active: true,
        OR: [{ workspaceId }, { workspace: { name: 'SYSTEM' } }],
      },
      select: { normalizedAddress: true },
    }),
    prisma.addressContract.findMany({ select: { normalizedAddress: true } }),
    prisma.tokenContract.findMany({ select: { normalizedAddress: true } }),
    getReportingConfig(),
  ])

  return {
    nftAddresses: Array.from(new Set(contracts.map((contract) => contract.normalizedAddress))),
    zeroAddresses: Array.from(new Set(zeroAddresses.map((address) => address.normalizedAddress))),
    registeredAddresses: Array.from(new Set([
      ...allAddressContracts.map((address) => address.normalizedAddress),
      ...allTokenContracts.map((contract) => contract.normalizedAddress),
    ])),
    timezone: config.reportingTimezone,
  }
}

function voucherEventsSql(context: Awaited<ReturnType<typeof voucherContext>>): Prisma.Sql {
  return Prisma.sql`
    WITH purchase_events AS (
      SELECT DISTINCT ON (LOWER(detail."tokenAddress"), detail."tokenId")
        LOWER(detail."tokenAddress") AS token_address,
        detail."tokenId" AS token_id,
        detail."toHash" AS purchase_wallet,
        detail."timestamp" AS purchase_at,
        detail."tokenName" AS event_name
      FROM "RedemptionTransactionDetail" detail
      WHERE LOWER(detail."tokenAddress")=ANY(${addressArray(context.nftAddresses)})
        AND LOWER(detail."fromHash")=ANY(${addressArray(context.zeroAddresses)})
        AND detail."tokenId" IS NOT NULL
        AND NOT(LOWER(detail."toHash")=ANY(${addressArray(context.registeredAddresses)}))
      ORDER BY LOWER(detail."tokenAddress"), detail."tokenId", detail."timestamp" ASC, detail.key ASC
    ),
    redeem_events AS (
      SELECT DISTINCT ON (LOWER(detail."tokenAddress"), detail."tokenId")
        LOWER(detail."tokenAddress") AS token_address,
        detail."tokenId" AS token_id,
        detail."timestamp" AS used_at
      FROM "RedemptionTransactionDetail" detail
      WHERE LOWER(detail."tokenAddress")=ANY(${addressArray(context.nftAddresses)})
        AND LOWER(detail."toHash")=ANY(${addressArray(context.zeroAddresses)})
        AND detail."tokenId" IS NOT NULL
        AND NOT(LOWER(detail."fromHash")=ANY(${addressArray(context.registeredAddresses)}))
      ORDER BY LOWER(detail."tokenAddress"), detail."tokenId", detail."timestamp" DESC, detail.key DESC
    )
  `
}

export interface NftVoucherActivityPoint {
  name: string
  purchase: number
  redeem: number
  tokenAddress: string
  tokenId: string
  imageUrl: string
}

export interface NftVoucherRow {
  tokenAddress: string
  tokenId: string
  name: string
  ownerHash: string
  detailTH: string | null
  purchaseWallet: string
  purchaseAt: string
  usedAt: string | null
  status: 'Available' | 'Used'
  imageUrl: string
}

export interface NftVoucherReport {
  activity: NftVoucherActivityPoint[]
  rows: NftVoucherRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  timezone: string
}

export async function getNftVoucherReport(
  workspaceId: number,
  requestedPage: number,
  includeActivity: boolean,
  includeVouchers: boolean,
): Promise<NftVoucherReport> {
  const context = await voucherContext(workspaceId)
  if (context.nftAddresses.length === 0 || context.zeroAddresses.length === 0) {
    return { activity: [], rows: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1, timezone: context.timezone }
  }

  const eventCtes = voucherEventsSql(context)
  const [activityRows, countRows] = await Promise.all([
    includeActivity
      ? prisma.$queryRaw<ActivitySqlRow[]>(Prisma.sql`
          ${eventCtes}
          SELECT COALESCE(NULLIF(instance.name, ''), NULLIF(purchase.event_name, ''), 'Unknown NFT') AS name,
            COUNT(*)::bigint AS purchase_count,
            COUNT(redeem.token_id)::bigint AS redeem_count,
            (ARRAY_AGG(purchase.token_address ORDER BY purchase.purchase_at DESC, purchase.token_id ASC))[1] AS token_address,
            (ARRAY_AGG(purchase.token_id ORDER BY purchase.purchase_at DESC, purchase.token_id ASC))[1] AS token_id
          FROM purchase_events purchase
          JOIN "NFTInstance" instance
            ON instance."normalizedTokenAddress"=purchase.token_address AND instance.id=purchase.token_id
          LEFT JOIN redeem_events redeem
            ON redeem.token_address=purchase.token_address AND redeem.token_id=purchase.token_id
          WHERE instance.visible=true
          GROUP BY COALESCE(NULLIF(instance.name, ''), NULLIF(purchase.event_name, ''), 'Unknown NFT')
          ORDER BY purchase_count DESC, name ASC
        `)
      : Promise.resolve([]),
    includeVouchers
      ? prisma.$queryRaw<CountSqlRow[]>(Prisma.sql`
          ${eventCtes}
          SELECT COUNT(*)::bigint AS total
          FROM purchase_events purchase
          JOIN "NFTInstance" instance
            ON instance."normalizedTokenAddress"=purchase.token_address AND instance.id=purchase.token_id
          WHERE instance.visible=true
        `)
      : Promise.resolve([{ total: BigInt(0) }]),
  ])

  const total = Number(countRows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const voucherRows = includeVouchers
    ? await prisma.$queryRaw<VoucherSqlRow[]>(Prisma.sql`
        ${eventCtes}
        SELECT purchase.token_address, purchase.token_id,
          COALESCE(NULLIF(instance.name, ''), NULLIF(purchase.event_name, ''), 'Unknown NFT') AS name,
          instance."ownerHash" AS owner_hash,
          instance."detailTH" AS detail_th,
          purchase.purchase_wallet, purchase.purchase_at, redeem.used_at
        FROM purchase_events purchase
        JOIN "NFTInstance" instance
          ON instance."normalizedTokenAddress"=purchase.token_address AND instance.id=purchase.token_id
        LEFT JOIN redeem_events redeem
          ON redeem.token_address=purchase.token_address AND redeem.token_id=purchase.token_id
        WHERE instance.visible=true
        ORDER BY COALESCE(redeem.used_at, purchase.purchase_at) DESC,
          purchase.token_address ASC, purchase.token_id ASC
        OFFSET ${(page - 1) * PAGE_SIZE}
        LIMIT ${PAGE_SIZE}
      `)
    : []

  return {
    activity: activityRows.map((row) => ({
      name: row.name,
      purchase: Number(row.purchase_count),
      redeem: Number(row.redeem_count),
      tokenAddress: row.token_address,
      tokenId: row.token_id,
      imageUrl: `/api/reports/nft-vouchers/image?workspace=${workspaceId}&contract=${encodeURIComponent(row.token_address)}&tokenId=${encodeURIComponent(row.token_id)}`,
    })),
    rows: voucherRows.map((row) => ({
      tokenAddress: row.token_address,
      tokenId: row.token_id,
      name: row.name,
      ownerHash: row.owner_hash,
      detailTH: row.detail_th,
      purchaseWallet: row.purchase_wallet,
      purchaseAt: row.purchase_at.toISOString(),
      usedAt: row.used_at?.toISOString() ?? null,
      status: context.zeroAddresses.includes(row.owner_hash.toLowerCase()) ? 'Used' : 'Available',
      imageUrl: `/api/reports/nft-vouchers/image?workspace=${workspaceId}&contract=${encodeURIComponent(row.token_address)}&tokenId=${encodeURIComponent(row.token_id)}`,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
    timezone: context.timezone,
  }
}
