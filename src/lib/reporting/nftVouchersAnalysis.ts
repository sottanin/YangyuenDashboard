import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getReportingConfig } from '@/lib/system/config'
import type { ReportDateRange } from './reportPeriod'

const PAGE_SIZE = 24
export interface VoucherFilters { range: ReportDateRange; search: string; status: 'all' | 'Available' | 'Used' | 'Unknown' }
interface ActivitySqlRow { name: string; purchase_count: bigint; redeem_count: bigint; token_address: string; token_id: string }
interface VoucherSqlRow { token_address: string; token_id: string; name: string; owner_hash: string; detail_th: string | null; purchase_wallet: string; purchase_at: Date; used_at: Date | null; status: 'Available' | 'Used' | 'Unknown' }
interface InventorySqlRow { total: bigint; available: bigint; used: bigint; unknown: bigint; data_through: Date | null; paired_used: bigint; average_days_to_use: Prisma.Decimal | null }
function array(values: string[]): Prisma.Sql { return values.length ? Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]` : Prisma.sql`ARRAY[]::text[]` }
async function voucherContext(workspaceId: number) {
  const [contracts, addresses, allTokens, config] = await Promise.all([
    prisma.tokenContract.findMany({ where: { standard: 'KAP-721', active: true, OR: [{ workspaceId }, { aggregateAcrossWorkspaces: true }] }, select: { normalizedAddress: true } }),
    prisma.addressContract.findMany({ select: { normalizedAddress: true, role: true } }),
    prisma.tokenContract.findMany({ select: { normalizedAddress: true } }), getReportingConfig(),
  ])
  return { nftAddresses: contracts.map((item) => item.normalizedAddress), zeroAddresses: Array.from(new Set(['0x0000000000000000000000000000000000000000', ...addresses.filter((item) => item.role === 'ZERO').map((item) => item.normalizedAddress)])), registeredAddresses: [...addresses, ...allTokens].map((item) => item.normalizedAddress), timezone: config.reportingTimezone }
}
function inventorySql(context: Awaited<ReturnType<typeof voucherContext>>, filters: VoucherFilters): Prisma.Sql {
  const pattern = `%${filters.search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  return Prisma.sql`WITH purchase_events AS (
    SELECT DISTINCT ON (LOWER(d."tokenAddress"),d."tokenId") LOWER(d."tokenAddress") token_address,d."tokenId" token_id,d."toHash" purchase_wallet,d."timestamp" purchase_at,d."tokenName" event_name
    FROM "RedemptionTransactionDetail" d WHERE LOWER(d."tokenAddress")=ANY(${array(context.nftAddresses)}) AND LOWER(d."fromHash")=ANY(${array(context.zeroAddresses)}) AND d."tokenId" IS NOT NULL AND NOT(LOWER(d."toHash")=ANY(${array(context.registeredAddresses)}))
    ORDER BY LOWER(d."tokenAddress"),d."tokenId",d."timestamp",d.key
  ),latest_events AS (
    SELECT DISTINCT ON (LOWER(d."tokenAddress"),d."tokenId") LOWER(d."tokenAddress") token_address,d."tokenId" token_id,d."toHash" owner_hash,d."timestamp" observed_at
    FROM "RedemptionTransactionDetail" d WHERE LOWER(d."tokenAddress")=ANY(${array(context.nftAddresses)}) AND d."tokenId" IS NOT NULL ORDER BY LOWER(d."tokenAddress"),d."tokenId",d."timestamp" DESC,d.key DESC
  ),redeem_events AS (
    SELECT LOWER(d."tokenAddress") token_address,d."tokenId" token_id,MAX(d."timestamp") used_at FROM "RedemptionTransactionDetail" d
    WHERE LOWER(d."tokenAddress")=ANY(${array(context.nftAddresses)}) AND LOWER(d."toHash")=ANY(${array(context.zeroAddresses)}) AND NOT(LOWER(d."fromHash")=ANY(${array(context.registeredAddresses)})) AND d."tokenId" IS NOT NULL GROUP BY LOWER(d."tokenAddress"),d."tokenId"
  ),inventory AS (
    SELECT p.*,COALESCE(NULLIF(n.name,''),NULLIF(p.event_name,''),'Unknown NFT') name,n."detailTH" detail_th,COALESCE(l.owner_hash,n."ownerHash",'') owner_hash,l.observed_at,r.used_at,
      CASE WHEN LOWER(COALESCE(l.owner_hash,n."ownerHash",''))=ANY(${array(context.zeroAddresses)}) THEN 'Used' WHEN COALESCE(l.owner_hash,n."ownerHash",'') ~* '^0x[0-9a-f]{40}$' AND NOT(LOWER(COALESCE(l.owner_hash,n."ownerHash",''))=ANY(${array(context.registeredAddresses)})) THEN 'Available' ELSE 'Unknown' END status
    FROM purchase_events p JOIN "NFTInstance" n ON n."normalizedTokenAddress"=p.token_address AND n.id=p.token_id LEFT JOIN latest_events l USING(token_address,token_id) LEFT JOIN redeem_events r USING(token_address,token_id) WHERE n.visible=true
  ),filtered AS (
    SELECT * FROM inventory WHERE purchase_at>=${filters.range.start} AND purchase_at<${filters.range.end}
      ${filters.search ? Prisma.sql`AND (name ILIKE ${pattern} ESCAPE '\\' OR token_id ILIKE ${pattern} ESCAPE '\\' OR purchase_wallet ILIKE ${pattern} ESCAPE '\\' OR owner_hash ILIKE ${pattern} ESCAPE '\\')` : Prisma.empty}
      ${filters.status === 'all' ? Prisma.empty : Prisma.sql`AND status=${filters.status}`}
  )`
}
export interface NftVoucherActivityPoint { name: string; purchase: number; redeem: number; tokenAddress: string; tokenId: string; imageUrl: string }
export interface NftVoucherRow { tokenAddress: string; tokenId: string; name: string; ownerHash: string; detailTH: string | null; purchaseWallet: string; purchaseAt: string; usedAt: string | null; status: 'Available' | 'Used' | 'Unknown'; imageUrl: string }
export interface NftVoucherReport { activity: NftVoucherActivityPoint[]; rows: NftVoucherRow[]; total: number; page: number; pageSize: number; totalPages: number; timezone: string; period: { from: string; to: string }; inventory: { total: number; available: number; used: number; unknown: number; pairedUsed: number; averageDaysToUse: string | null } | null; dataThrough: string | null }
export async function getNftVoucherReport(workspaceId: number, requestedPage: number, includeActivity: boolean, includeVouchers: boolean, filters: VoucherFilters): Promise<NftVoucherReport> {
  const context = await voucherContext(workspaceId)
  const cte = inventorySql(context, filters)
  const [activityRows, inventoryRows] = await Promise.all([
    includeActivity ? prisma.$queryRaw<ActivitySqlRow[]>(Prisma.sql`${cte} SELECT name,COUNT(*)::bigint purchase_count,COUNT(*) FILTER(WHERE used_at>=purchase_at)::bigint redeem_count,(ARRAY_AGG(token_address ORDER BY purchase_at DESC,token_id))[1] token_address,(ARRAY_AGG(token_id ORDER BY purchase_at DESC,token_id))[1] token_id FROM filtered GROUP BY name ORDER BY purchase_count DESC,name`) : Promise.resolve([] as ActivitySqlRow[]),
    includeVouchers ? prisma.$queryRaw<InventorySqlRow[]>(Prisma.sql`${cte} SELECT COUNT(*)::bigint total,COUNT(*) FILTER(WHERE status='Available')::bigint available,COUNT(*) FILTER(WHERE status='Used')::bigint used,COUNT(*) FILTER(WHERE status='Unknown')::bigint unknown,MAX(observed_at) data_through,COUNT(*) FILTER(WHERE used_at>=purchase_at)::bigint paired_used,AVG(EXTRACT(EPOCH FROM (used_at-purchase_at))/86400) FILTER(WHERE used_at>=purchase_at) average_days_to_use FROM filtered`) : Promise.resolve([] as InventorySqlRow[]),
  ])
  const stats = inventoryRows[0]
  const total = Number(stats?.total ?? 0); const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE)); const page = Math.min(Math.max(1, requestedPage), totalPages)
  const rows = includeVouchers ? await prisma.$queryRaw<VoucherSqlRow[]>(Prisma.sql`${cte} SELECT * FROM filtered ORDER BY COALESCE(used_at,purchase_at) DESC,token_address,token_id OFFSET ${(page - 1) * PAGE_SIZE} LIMIT ${PAGE_SIZE}`) : []
  const imageUrl = (address: string, id: string): string => `/api/reports/nft-vouchers/image?workspace=${workspaceId}&contract=${encodeURIComponent(address)}&tokenId=${encodeURIComponent(id)}`
  return { activity: activityRows.map((row) => ({ name: row.name, purchase: Number(row.purchase_count), redeem: Number(row.redeem_count), tokenAddress: row.token_address, tokenId: row.token_id, imageUrl: imageUrl(row.token_address, row.token_id) })), rows: rows.map((row) => ({ tokenAddress: row.token_address, tokenId: row.token_id, name: row.name, ownerHash: row.owner_hash, detailTH: row.detail_th, purchaseWallet: row.purchase_wallet, purchaseAt: row.purchase_at.toISOString(), usedAt: row.used_at?.toISOString() ?? null, status: row.status, imageUrl: imageUrl(row.token_address, row.token_id) })), total, page, pageSize: PAGE_SIZE, totalPages, timezone: context.timezone, period: { from: filters.range.from, to: filters.range.to }, inventory: stats ? { total, available: Number(stats.available), used: Number(stats.used), unknown: Number(stats.unknown), pairedUsed: Number(stats.paired_used), averageDaysToUse: stats.average_days_to_use?.toFixed(1) ?? null } : null, dataThrough: stats?.data_through?.toISOString() ?? null }
}
