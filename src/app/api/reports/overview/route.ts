import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, isSelectableReportWorkspace, parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'

const TIME_ZONE = 'Asia/Bangkok'
const ZERO = '0x0000000000000000000000000000000000000000'
const LIMIT = 20
interface SummaryRow { total_transactions: bigint; total_fee: Prisma.Decimal; today_transactions: bigint; yesterday_transactions: bigint; today_fee: Prisma.Decimal; yesterday_fee: Prisma.Decimal }
interface AmountRow { metric: string; token_address: string | null; total: Prisma.Decimal; today: Prisma.Decimal; yesterday: Prisma.Decimal }
interface NftRow { metric: string; total: bigint; today: bigint; yesterday: bigint }
interface MonthlyRow { label: string; kap20: bigint; kap22: bigint; kap721: bigint }
interface HistoryRow { key: string; tx_id: string; timestamp: Date; from_hash: string; to_hash: string; token_address: string; token_name: string; token_symbol: string; standard: string; type: string; value: string; token_id: string | null; status: string | null }
interface CountRow { count: bigint }

function array(values: string[]): Prisma.Sql { return values.length ? Prisma.sql`ARRAY[${Prisma.join(values.map((v) => v.toLowerCase()))}]::text[]` : Prisma.sql`ARRAY[]::text[]` }
function change(today: number, yesterday: number): number { return yesterday === 0 ? (today === 0 ? 0 : 100) : Number((((today - yesterday) / yesterday) * 100).toFixed(1)) }
function dec(value?: Prisma.Decimal | null): Prisma.Decimal { return value ?? new Prisma.Decimal(0) }

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const overviewKpis = ['overview.total-transactions', 'overview.total-gas-fee', 'overview.token-distributed', 'overview.token-redeemed', 'overview.nft-mint', 'overview.nft-burn', 'overview.point-token-distributed'] as const
    if (!canAccessMenu(admin, 'overview') || !canAccessAnyChart(admin, [...overviewKpis, 'overview.monthly-transactions', 'overview.transaction-history'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const showMonthly = canAccessChart(admin, 'overview.monthly-transactions')
    const showHistory = canAccessChart(admin, 'overview.transaction-history')
    const url = new URL(request.url)
    const workspace = parseWorkspaceSelection(url.searchParams.get('workspace'))
    if (workspace === null || workspace === 'all') return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    if (!(await isSelectableReportWorkspace(workspace))) return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    const page = Math.min(10_000, Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1))
    const search = (url.searchParams.get('search') ?? '').trim().slice(0, 128)
    const pattern = `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    const scope = await getWorkspaceReportScope(workspace)
    const scoped = array(scope.tokenAddresses ?? [])
    const [tokens, addresses, registry] = await Promise.all([
      prisma.tokenContract.findMany({ where: { workspaceId: workspace }, select: { id: true, normalizedAddress: true, name: true, symbol: true, standard: true, imageKey: true } }),
      prisma.addressContract.findMany({ where: { active: true, OR: [{ workspaceId: workspace }, { workspaceId: null }, { workspace: { name: { equals: 'SYSTEM', mode: 'insensitive' } } }] }, select: { normalizedAddress: true, name: true, role: true } }),
      prisma.$queryRaw<Array<{ address: string }>>(Prisma.sql`SELECT "normalizedAddress" address FROM "TokenContract" UNION SELECT "normalizedAddress" address FROM "AddressContract"`),
    ])
    const names = new Map(addresses.map((a) => [a.normalizedAddress.toLowerCase(), a.name]))
    const roles = (wanted: string[]): string[] => addresses.filter((a) => wanted.includes(a.role.toUpperCase())).map((a) => a.normalizedAddress)
    const registered = array([...registry.map((r) => r.address), ZERO])
    const swaps = array(roles(['LOYALTY_SWAP']))
    const markets = array(roles(['LOYALTY_MARKETPLACE', 'MARKETPLACE']))
    const pools = array(roles(['DISTRIBUTOR_POOL', 'DISTRIBUTORPOOL', 'OPERATION_POOL', 'OPERATIONPOOL']))
    const kap20 = array(tokens.filter((t) => t.standard?.toUpperCase() === 'KAP-20').map((t) => t.normalizedAddress))
    const kap22Tokens = tokens.filter((t) => t.standard?.toUpperCase() === 'KAP-22')
    const kap22 = array(kap22Tokens.map((t) => t.normalizedAddress))
    const day = Prisma.sql`("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${TIME_ZONE})::date`
    const searchWhere = search ? Prisma.sql`(tx_id ILIKE ${pattern} ESCAPE '\\' OR from_hash ILIKE ${pattern} ESCAPE '\\' OR to_hash ILIKE ${pattern} ESCAPE '\\' OR token_name ILIKE ${pattern} ESCAPE '\\' OR token_symbol ILIKE ${pattern} ESCAPE '\\' OR COALESCE(token_id, '') ILIKE ${pattern} ESCAPE '\\')` : Prisma.sql`TRUE`

    const [summaryResult, amounts, nfts, monthly, rows, countResult] = await Promise.all([
      prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
        WITH h AS (
          SELECT x."timestamp", x.fee FROM "TransactionHeader" x WHERE EXISTS (SELECT 1 FROM "TransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}))
          UNION ALL SELECT x."timestamp", x.fee FROM "RedemptionTransactionHeader" x WHERE EXISTS (SELECT 1 FROM "RedemptionTransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}))
        ) SELECT COUNT(*)::bigint total_transactions, COALESCE(SUM(fee),0) total_fee,
          COUNT(*) FILTER (WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date)::bigint today_transactions,
          COUNT(*) FILTER (WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date-1)::bigint yesterday_transactions,
          COALESCE(SUM(fee) FILTER (WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date),0) today_fee,
          COALESCE(SUM(fee) FILTER (WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date-1),0) yesterday_fee FROM h`),
      prisma.$queryRaw<AmountRow[]>(Prisma.sql`
        WITH e AS (SELECT LOWER("tokenAddress") token_address,LOWER("fromHash") from_hash,LOWER("toHash") to_hash,value,"timestamp" FROM "TransactionDetail" WHERE LOWER("tokenAddress")=ANY(${scoped})),
        m AS (
          SELECT 'kap20Distributed'::text metric,NULL::text metric_token,e.* FROM e WHERE token_address=ANY(${kap20}) AND from_hash=ANY(${swaps}) AND NOT(to_hash=ANY(${registered}))
          UNION ALL SELECT 'kap20Redeemed',NULL::text,e.* FROM e WHERE token_address=ANY(${kap20}) AND NOT(from_hash=ANY(${registered})) AND to_hash=ANY(${markets})
          UNION ALL SELECT 'kap22',token_address,e.* FROM e WHERE token_address=ANY(${kap22}) AND from_hash=ANY(${pools}) AND NOT(to_hash=ANY(${registered}))
        ) SELECT metric,metric_token token_address,COALESCE(SUM(value),0) total,
          COALESCE(SUM(value) FILTER(WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date),0) today,
          COALESCE(SUM(value) FILTER(WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date-1),0) yesterday FROM m GROUP BY metric,metric_token`),
      prisma.$queryRaw<NftRow[]>(Prisma.sql`
        WITH e AS (SELECT LOWER("fromHash") from_hash,LOWER("toHash") to_hash,"timestamp" FROM "RedemptionTransactionDetail" WHERE LOWER("tokenAddress")=ANY(${scoped})),
        m AS (SELECT 'mint'::text metric,* FROM e WHERE from_hash=${ZERO} AND NOT(to_hash=ANY(${registered})) UNION ALL SELECT 'burn',* FROM e WHERE NOT(from_hash=ANY(${registered})) AND to_hash=${ZERO})
        SELECT metric,COUNT(*)::bigint total,COUNT(*) FILTER(WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date)::bigint today,COUNT(*) FILTER(WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date-1)::bigint yesterday FROM m GROUP BY metric`),
      prisma.$queryRaw<MonthlyRow[]>(Prisma.sql`
        WITH e AS (
          SELECT TO_CHAR(DATE_TRUNC('month',"timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${TIME_ZONE}),'YYYY-MM') label,"txId",CASE WHEN LOWER("tokenAddress")=ANY(${kap20}) THEN 'kap20' ELSE 'kap22' END kind FROM "TransactionDetail" WHERE LOWER("tokenAddress")=ANY(${scoped})
          UNION ALL SELECT TO_CHAR(DATE_TRUNC('month',"timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${TIME_ZONE}),'YYYY-MM'),"txId",'kap721' FROM "RedemptionTransactionDetail" WHERE LOWER("tokenAddress")=ANY(${scoped})
        ), recent AS (SELECT DISTINCT label FROM e ORDER BY label DESC LIMIT 12)
        SELECT e.label,COUNT(DISTINCT "txId") FILTER(WHERE kind='kap20')::bigint kap20,COUNT(DISTINCT "txId") FILTER(WHERE kind='kap22')::bigint kap22,COUNT(DISTINCT "txId") FILTER(WHERE kind='kap721')::bigint kap721 FROM e JOIN recent USING(label) GROUP BY e.label ORDER BY e.label`),
      prisma.$queryRaw<HistoryRow[]>(Prisma.sql`
        WITH c AS (
          SELECT 'kap-'||d.key key,d."txId" tx_id,d."timestamp",d."fromHash" from_hash,d."toHash" to_hash,LOWER(d."tokenAddress") token_address,d."tokenName" token_name,d."tokenSymbol" token_symbol,COALESCE(t.standard,d."txType") standard,
            CASE WHEN LOWER(d."fromHash")=${ZERO} THEN 'Mint' WHEN LOWER(d."toHash")=${ZERO} THEN 'Burn' ELSE 'Transfer' END type,
            d.value::text value,NULL::text token_id,h.status FROM "TransactionDetail" d JOIN "TransactionHeader" h USING("txId") LEFT JOIN "TokenContract" t ON t."normalizedAddress"=LOWER(d."tokenAddress") AND t."workspaceId"=${workspace} WHERE LOWER(d."tokenAddress")=ANY(${scoped})
          UNION ALL SELECT 'nft-'||d.key,d."txId",d."timestamp",d."fromHash",d."toHash",LOWER(d."tokenAddress"),d."tokenName",d."tokenSymbol",'KAP-721',
            CASE WHEN LOWER(d."fromHash")=${ZERO} THEN 'Mint' WHEN LOWER(d."toHash")=${ZERO} THEN 'Burn' ELSE 'Transfer' END,
            '1',d."tokenId",h.status FROM "RedemptionTransactionDetail" d JOIN "RedemptionTransactionHeader" h USING("txId") WHERE LOWER(d."tokenAddress")=ANY(${scoped})
        ) SELECT * FROM c WHERE ${searchWhere} ORDER BY "timestamp" DESC,key DESC OFFSET ${(page - 1) * LIMIT} LIMIT ${LIMIT}`),
      prisma.$queryRaw<CountRow[]>(Prisma.sql`
        WITH c AS (
          SELECT d."txId" tx_id,d."fromHash" from_hash,d."toHash" to_hash,d."tokenName" token_name,d."tokenSymbol" token_symbol,NULL::text token_id FROM "TransactionDetail" d WHERE LOWER(d."tokenAddress")=ANY(${scoped})
          UNION ALL SELECT d."txId",d."fromHash",d."toHash",d."tokenName",d."tokenSymbol",d."tokenId" FROM "RedemptionTransactionDetail" d WHERE LOWER(d."tokenAddress")=ANY(${scoped})
        ) SELECT COUNT(*)::bigint count FROM c WHERE ${searchWhere}`),
    ])
    const summary = summaryResult[0] ?? { total_transactions: BigInt(0), total_fee: new Prisma.Decimal(0), today_transactions: BigInt(0), yesterday_transactions: BigInt(0), today_fee: new Prisma.Decimal(0), yesterday_fee: new Prisma.Decimal(0) }
    const plainAmounts = new Map(amounts.filter((r) => !r.token_address).map((r) => [r.metric, r]))
    const kap22Amounts = new Map(amounts.filter((r) => r.token_address).map((r) => [r.token_address as string, r]))
    const nftMap = new Map(nfts.map((r) => [r.metric, r]))
    const amountMetric = (key: string) => { const r = plainAmounts.get(key); return { value: dec(r?.total).toString(), change: change(dec(r?.today).toNumber(), dec(r?.yesterday).toNumber()) } }
    const nftMetric = (key: string) => { const r = nftMap.get(key); return { value: String(r?.total ?? BigInt(0)), change: change(Number(r?.today ?? BigInt(0)), Number(r?.yesterday ?? BigInt(0))) } }
    const total = Number(countResult[0]?.count ?? BigInt(0))
    const tokenByAddress = new Map(tokens.map((token) => [token.normalizedAddress.toLowerCase(), token]))
    const kap20Token = tokens.find((token) => token.standard?.toUpperCase() === 'KAP-20')
    const nftToken = tokens.find((token) => token.standard?.toUpperCase() === 'KAP-721')
    const canonicalOrder = new Map(['FIT', 'GRN', 'INT', 'TGT'].map((symbol, index) => [symbol, index]))
    const orderedKap22 = [...kap22Tokens].sort((a, b) => (canonicalOrder.get((a.symbol ?? '').toUpperCase()) ?? 100) - (canonicalOrder.get((b.symbol ?? '').toUpperCase()) ?? 100) || (a.symbol ?? a.name).localeCompare(b.symbol ?? b.name))
    const tokenImage = (token: typeof tokens[number] | undefined): string | null => token?.imageKey ? `/api/contracts/token/${token.id}/image` : null
    const hiddenMetric = { value: '0', change: 0 }
    return NextResponse.json({ timezone: TIME_ZONE, kpis: {
      totalTransactions: canAccessChart(admin, 'overview.total-transactions') ? { value: String(summary.total_transactions), change: change(Number(summary.today_transactions), Number(summary.yesterday_transactions)) } : hiddenMetric,
      dailyGasFee: hiddenMetric,
      totalGasFee: canAccessChart(admin, 'overview.total-gas-fee') ? { value: dec(summary.total_fee).toFixed(3), change: change(dec(summary.today_fee).toNumber(), dec(summary.yesterday_fee).toNumber()) } : hiddenMetric,
      kap20Distributed: canAccessChart(admin, 'overview.token-distributed') ? { ...amountMetric('kap20Distributed'), imageUrl: tokenImage(kap20Token), symbol: kap20Token?.symbol ?? 'KAP-20' } : hiddenMetric,
      kap20Redeemed: canAccessChart(admin, 'overview.token-redeemed') ? { ...amountMetric('kap20Redeemed'), imageUrl: tokenImage(kap20Token), symbol: kap20Token?.symbol ?? 'KAP-20' } : hiddenMetric,
      kap22: canAccessChart(admin, 'overview.point-token-distributed') ? orderedKap22.map((t) => { const r = kap22Amounts.get(t.normalizedAddress.toLowerCase()); return { symbol: t.symbol || t.name, imageUrl: tokenImage(t), value: dec(r?.total).toString(), change: change(dec(r?.today).toNumber(), dec(r?.yesterday).toNumber()) } }) : [],
      nftMint: canAccessChart(admin, 'overview.nft-mint') ? { ...nftMetric('mint'), imageUrl: tokenImage(nftToken) } : hiddenMetric,
      nftBurn: canAccessChart(admin, 'overview.nft-burn') ? { ...nftMetric('burn'), imageUrl: tokenImage(nftToken) } : hiddenMetric,
    }, monthly: showMonthly ? monthly.map((r) => ({ label: r.label, kap20: Number(r.kap20), kap22: Number(r.kap22), kap721: Number(r.kap721) })) : [],
    transactions: showHistory ? { rows: rows.map((r) => ({ key:r.key,txId:r.tx_id,timestamp:r.timestamp.toISOString(),fromHash:r.from_hash,toHash:r.to_hash,fromName:names.get(r.from_hash.toLowerCase())??null,toName:names.get(r.to_hash.toLowerCase())??null,tokenAddress:r.token_address,tokenName:r.token_name,tokenSymbol:r.token_symbol,standard:r.standard,type:r.type,value:r.value,tokenId:r.token_id,status:r.status,imageUrl:r.standard === 'KAP-721' && r.token_id ? `/api/reports/nft-redemptions/image?workspace=${workspace}&contract=${encodeURIComponent(r.token_address)}&tokenId=${encodeURIComponent(r.token_id)}` : tokenImage(tokenByAddress.get(r.token_address)) })), total, page, totalPages: Math.max(1,Math.ceil(total/LIMIT)) } : { rows: [], total: 0, page: 1, totalPages: 1 } })
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('Overview report error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Failed to load overview report' }, { status: 500 })
  }
}
