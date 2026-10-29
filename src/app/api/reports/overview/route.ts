import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, isSelectableReportWorkspace, parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { normalizeAddress } from '@/lib/system/addresses'
import { getPreviousReportRange, parseReportDateRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'

const TIME_ZONE = 'Asia/Bangkok'
const ZERO = '0x0000000000000000000000000000000000000000'
const LIMIT = 20
interface TimelinePoint { label: string; value: number }
interface SummaryRow { daily: TimelinePoint[]; total_transactions: bigint; total_fee: Prisma.Decimal; today_transactions: bigint; yesterday_transactions: bigint; today_fee: Prisma.Decimal; yesterday_fee: Prisma.Decimal }
interface AmountRow { metric: string; token_address: string | null; total: Prisma.Decimal; today: Prisma.Decimal; yesterday: Prisma.Decimal }
interface NftRow { metric: string; total: bigint; today: bigint; yesterday: bigint }
interface HistoryRow { key: string; tx_id: string; timestamp: Date; from_hash: string; to_hash: string; token_address: string; token_name: string; token_symbol: string; standard: string; type: string; value: string; token_id: string | null; status: string | null }
interface CountRow { count: bigint }

function array(values: string[]): Prisma.Sql { return values.length ? Prisma.sql`ARRAY[${Prisma.join(values.map((v) => v.toLowerCase()))}]::text[]` : Prisma.sql`ARRAY[]::text[]` }
function dec(value?: Prisma.Decimal | null): Prisma.Decimal { return value ?? new Prisma.Decimal(0) }

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const overviewKpis = ['overview.total-transactions', 'overview.total-gas-fee', 'overview.token-distributed', 'overview.token-redeemed', 'overview.redemption-fee', 'overview.nft-mint', 'overview.nft-burn', 'overview.point-token-distributed'] as const
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
    const range = await parseReportDateRange(url.searchParams)
    const previousRange = await getPreviousReportRange(range)
    const selectedToken = normalizeAddress(url.searchParams.get('token') ?? '')
    const [tokens, addresses, registry] = await Promise.all([
      prisma.tokenContract.findMany({ where: { OR: [{ workspaceId: workspace }, { active: true, standard: 'KAP-721', aggregateAcrossWorkspaces: true }] }, select: { id: true, workspaceId: true, normalizedAddress: true, name: true, symbol: true, standard: true, imageKey: true, active: true } }),
      prisma.addressContract.findMany({ where: { active: true, OR: [{ workspaceId: workspace }, { workspaceId: null }, { workspace: { name: { equals: 'SYSTEM', mode: 'insensitive' } } }, { role: 'MARKETPLACE', aggregateAcrossWorkspaces: true }] }, select: { normalizedAddress: true, name: true, role: true } }),
      prisma.$queryRaw<Array<{ address: string }>>(Prisma.sql`SELECT "normalizedAddress" address FROM "TokenContract" UNION SELECT "normalizedAddress" address FROM "AddressContract"`),
    ])
    const names = new Map(addresses.map((a) => [a.normalizedAddress.toLowerCase(), a.name]))
    const roles = (wanted: string[]): string[] => addresses.filter((a) => wanted.includes(a.role.toUpperCase())).map((a) => a.normalizedAddress)
    const registered = array([...registry.map((r) => r.address), ZERO])
    const swaps = array(roles(['LOYALTY_SWAP']))
    const markets = array(roles(['LOYALTY_MARKETPLACE', 'MARKETPLACE']))
    const marketFees = array(roles(['MARKETPLACE_FEE']))
    const pools = array(roles(['DISTRIBUTOR_POOL', 'DISTRIBUTORPOOL', 'OPERATION_POOL', 'OPERATIONPOOL']))
    const selectableKap20 = tokens.filter((t) => t.active && t.workspaceId === workspace && t.standard?.toUpperCase() === 'KAP-20' && (scope.tokenAddresses ?? []).some((address) => address.toLowerCase() === t.normalizedAddress.toLowerCase()))
    const selectedKap20 = selectableKap20.find((token) => token.normalizedAddress.toLowerCase() === selectedToken)
    if (!selectedKap20) return NextResponse.json({ error: 'Select an active KAP-20 token for this workspace' }, { status: 400 })
    const kap20 = array([selectedKap20.normalizedAddress])
    const workspaceKap22Tokens = tokens.filter((t) => t.standard?.toUpperCase() === 'KAP-22')
    const singleKap20Root = selectableKap20.length === 1
    let kap22Tokens = workspaceKap22Tokens
    if (!singleKap20Root) {
      const kap22Candidates = array(workspaceKap22Tokens.map((token) => token.normalizedAddress))
      const linkedKap22Rows = await prisma.$queryRaw<Array<{ address: string }>>(Prisma.sql`
        SELECT DISTINCT LOWER(detail."toHash") address
        FROM "TransactionDetail" detail
        WHERE LOWER(detail."tokenAddress")=${selectedKap20.normalizedAddress}
          AND LOWER(detail."toHash")=ANY(${kap22Candidates})
      `)
      const linkedKap22 = new Set(linkedKap22Rows.map((row) => row.address))
      kap22Tokens = workspaceKap22Tokens.filter((token) => linkedKap22.has(token.normalizedAddress.toLowerCase()))
    }
    const kap22 = array(kap22Tokens.map((t) => t.normalizedAddress))
    const scoped = array([selectedKap20.normalizedAddress, ...kap22Tokens.map((token) => token.normalizedAddress)])
    const kap721 = array(tokens.filter((t) => t.standard?.toUpperCase() === 'KAP-721').map((t) => t.normalizedAddress))
    const day = Prisma.sql`("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${TIME_ZONE})::date`
    const searchWhere = search ? Prisma.sql`(tx_id ILIKE ${pattern} ESCAPE '\\' OR from_hash ILIKE ${pattern} ESCAPE '\\' OR to_hash ILIKE ${pattern} ESCAPE '\\' OR token_name ILIKE ${pattern} ESCAPE '\\' OR token_symbol ILIKE ${pattern} ESCAPE '\\' OR COALESCE(token_id, '') ILIKE ${pattern} ESCAPE '\\')` : Prisma.sql`TRUE`
    const nftAssociation = singleKap20Root ? Prisma.empty : Prisma.sql`AND EXISTS (SELECT 1 FROM "RedemptionTransactionDetail" mint JOIN "TransactionDetail" payment ON payment."txId"=mint."txId" WHERE LOWER(mint."tokenAddress")=LOWER(d."tokenAddress") AND mint."tokenId"=d."tokenId" AND LOWER(mint."fromHash")=${ZERO} AND LOWER(payment."tokenAddress")=ANY(${kap20}) AND LOWER(payment."toHash")=ANY(${markets}) AND NOT(LOWER(payment."fromHash")=ANY(${registered})))`

    const [summaryResult, amounts, nfts, rows, countResult] = await Promise.all([
      prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
        WITH events AS (
          SELECT x."txId",x."timestamp",x.fee FROM "TransactionHeader" x WHERE x."timestamp">=${range.start} AND x."timestamp"<${range.end} AND EXISTS (SELECT 1 FROM "TransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}))
          UNION ALL SELECT x."txId",x."timestamp",x.fee FROM "RedemptionTransactionHeader" x WHERE x."timestamp">=${range.start} AND x."timestamp"<${range.end} AND EXISTS (SELECT 1 FROM "RedemptionTransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${kap721}) ${nftAssociation})
        ), h AS (SELECT "txId",MIN("timestamp") "timestamp",MAX(fee) fee FROM events GROUP BY "txId")
        SELECT COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT('label',label,'value',value) ORDER BY label) FROM (
            SELECT TO_CHAR(${day},'YYYY-MM-DD') label,COUNT(*) value FROM h GROUP BY 1
          ) daily_counts),'[]'::jsonb) daily,
          COUNT(*)::bigint total_transactions, COALESCE(SUM(fee),0) total_fee,
          COUNT(*) FILTER (WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date)::bigint today_transactions,
          COUNT(*) FILTER (WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date-1)::bigint yesterday_transactions,
          COALESCE(SUM(fee) FILTER (WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date),0) today_fee,
          COALESCE(SUM(fee) FILTER (WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date-1),0) yesterday_fee FROM h`),
      prisma.$queryRaw<AmountRow[]>(Prisma.sql`
        WITH e AS (SELECT LOWER("tokenAddress") token_address,LOWER("fromHash") from_hash,LOWER("toHash") to_hash,value,"timestamp" FROM "TransactionDetail" WHERE "timestamp">=${range.start} AND "timestamp"<${range.end} AND LOWER("tokenAddress")=ANY(${scoped})),
        m AS (
          SELECT 'kap20Distributed'::text metric,NULL::text metric_token,e.* FROM e WHERE token_address=ANY(${kap20}) AND from_hash=ANY(${swaps}) AND NOT(to_hash=ANY(${registered}))
          UNION ALL SELECT 'kap20Redeemed',NULL::text,e.* FROM e WHERE token_address=ANY(${kap20}) AND NOT(from_hash=ANY(${registered})) AND to_hash=ANY(${markets})
          UNION ALL SELECT 'kap20Fee',NULL::text,e.* FROM e WHERE token_address=ANY(${kap20}) AND from_hash=ANY(${markets}) AND to_hash=ANY(${marketFees})
          UNION ALL SELECT 'kap22',token_address,e.* FROM e WHERE token_address=ANY(${kap22}) AND from_hash=ANY(${pools}) AND NOT(to_hash=ANY(${registered}))
        ) SELECT metric,metric_token token_address,COALESCE(SUM(value),0) total,
          COALESCE(SUM(value) FILTER(WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date),0) today,
          COALESCE(SUM(value) FILTER(WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date-1),0) yesterday FROM m GROUP BY metric,metric_token`),
      prisma.$queryRaw<NftRow[]>(Prisma.sql`
        WITH e AS (SELECT LOWER(d."fromHash") from_hash,LOWER(d."toHash") to_hash,d."timestamp" FROM "RedemptionTransactionDetail" d WHERE d."timestamp">=${range.start} AND d."timestamp"<${range.end} AND LOWER(d."tokenAddress")=ANY(${kap721}) ${nftAssociation}),
        m AS (SELECT 'mint'::text metric,* FROM e WHERE from_hash=${ZERO} AND NOT(to_hash=ANY(${registered})) UNION ALL SELECT 'burn',* FROM e WHERE NOT(from_hash=ANY(${registered})) AND to_hash=${ZERO})
        SELECT metric,COUNT(*)::bigint total,COUNT(*) FILTER(WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date)::bigint today,COUNT(*) FILTER(WHERE ${day}=(CURRENT_TIMESTAMP AT TIME ZONE ${TIME_ZONE})::date-1)::bigint yesterday FROM m GROUP BY metric`),
      prisma.$queryRaw<HistoryRow[]>(Prisma.sql`
        WITH c AS (
          SELECT 'kap-'||d.key key,d."txId" tx_id,d."timestamp",d."fromHash" from_hash,d."toHash" to_hash,LOWER(d."tokenAddress") token_address,d."tokenName" token_name,d."tokenSymbol" token_symbol,COALESCE(t.standard,d."txType") standard,
            CASE WHEN LOWER(d."fromHash")=${ZERO} THEN 'Mint' WHEN LOWER(d."toHash")=${ZERO} THEN 'Burn' ELSE 'Transfer' END type,
            d.value::text value,NULL::text token_id,h.status FROM "TransactionDetail" d JOIN "TransactionHeader" h USING("txId") LEFT JOIN "TokenContract" t ON t."normalizedAddress"=LOWER(d."tokenAddress") AND t."workspaceId"=${workspace} WHERE d."timestamp">=${range.start} AND d."timestamp"<${range.end} AND LOWER(d."tokenAddress")=ANY(${scoped})
          UNION ALL SELECT 'nft-'||d.key,d."txId",d."timestamp",d."fromHash",d."toHash",LOWER(d."tokenAddress"),d."tokenName",d."tokenSymbol",'KAP-721',
            CASE WHEN LOWER(d."fromHash")=${ZERO} THEN 'Mint' WHEN LOWER(d."toHash")=${ZERO} THEN 'Burn' ELSE 'Transfer' END,
            '1',d."tokenId",h.status FROM "RedemptionTransactionDetail" d JOIN "RedemptionTransactionHeader" h USING("txId") WHERE d."timestamp">=${range.start} AND d."timestamp"<${range.end} AND LOWER(d."tokenAddress")=ANY(${kap721}) ${nftAssociation}
        ) SELECT * FROM c WHERE ${searchWhere} ORDER BY "timestamp" DESC,key DESC OFFSET ${(page - 1) * LIMIT} LIMIT ${LIMIT}`),
      prisma.$queryRaw<CountRow[]>(Prisma.sql`
        WITH c AS (
          SELECT d."txId" tx_id,d."fromHash" from_hash,d."toHash" to_hash,d."tokenName" token_name,d."tokenSymbol" token_symbol,NULL::text token_id FROM "TransactionDetail" d WHERE d."timestamp">=${range.start} AND d."timestamp"<${range.end} AND LOWER(d."tokenAddress")=ANY(${scoped})
          UNION ALL SELECT d."txId",d."fromHash",d."toHash",d."tokenName",d."tokenSymbol",d."tokenId" FROM "RedemptionTransactionDetail" d WHERE d."timestamp">=${range.start} AND d."timestamp"<${range.end} AND LOWER(d."tokenAddress")=ANY(${kap721}) ${nftAssociation}
        ) SELECT COUNT(*)::bigint count FROM c WHERE ${searchWhere}`),
    ])
    interface PreviousMetric { metric: string; token_address: string | null; total: Prisma.Decimal }
    const previousRows = previousRange ? await prisma.$queryRaw<PreviousMetric[]>(Prisma.sql`
      WITH e AS (SELECT LOWER("tokenAddress") token_address,LOWER("fromHash") from_hash,LOWER("toHash") to_hash,value,"timestamp" FROM "TransactionDetail" WHERE "timestamp">=${previousRange.start} AND "timestamp"<${previousRange.end} AND LOWER("tokenAddress")=ANY(${scoped})),
      m AS (
        SELECT 'kap20Distributed'::text metric,NULL::text metric_token,value FROM e WHERE token_address=ANY(${kap20}) AND from_hash=ANY(${swaps}) AND NOT(to_hash=ANY(${registered}))
        UNION ALL SELECT 'kap20Redeemed',NULL::text,value FROM e WHERE token_address=ANY(${kap20}) AND NOT(from_hash=ANY(${registered})) AND to_hash=ANY(${markets})
        UNION ALL SELECT 'kap20Fee',NULL::text,value FROM e WHERE token_address=ANY(${kap20}) AND from_hash=ANY(${markets}) AND to_hash=ANY(${marketFees})
        UNION ALL SELECT 'kap22',token_address,value FROM e WHERE token_address=ANY(${kap22}) AND from_hash=ANY(${pools}) AND NOT(to_hash=ANY(${registered}))
      ) SELECT metric,metric_token token_address,SUM(value) total FROM m GROUP BY metric,metric_token
    `) : []
    const previousNfts = previousRange ? await prisma.$queryRaw<Array<{ metric: string; total: bigint }>>(Prisma.sql`
      SELECT CASE WHEN LOWER(d."fromHash")=${ZERO} THEN 'mint' ELSE 'burn' END metric,COUNT(*)::bigint total
      FROM "RedemptionTransactionDetail" d WHERE d."timestamp">=${previousRange.start} AND d."timestamp"<${previousRange.end} AND LOWER(d."tokenAddress")=ANY(${kap721}) ${nftAssociation}
      AND ((LOWER(d."fromHash")=${ZERO} AND NOT(LOWER(d."toHash")=ANY(${registered}))) OR (LOWER(d."toHash")=${ZERO} AND NOT(LOWER(d."fromHash")=ANY(${registered})))) GROUP BY metric
    `) : []
    const previousHeaders = previousRange ? await prisma.$queryRaw<Array<{ total: bigint; fee: Prisma.Decimal }>>(Prisma.sql`
      WITH e AS (
        SELECT x."txId",x.fee FROM "TransactionHeader" x WHERE x."timestamp">=${previousRange.start} AND x."timestamp"<${previousRange.end} AND EXISTS(SELECT 1 FROM "TransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}))
        UNION ALL SELECT x."txId",x.fee FROM "RedemptionTransactionHeader" x WHERE x."timestamp">=${previousRange.start} AND x."timestamp"<${previousRange.end} AND EXISTS(SELECT 1 FROM "RedemptionTransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${kap721}) ${nftAssociation})
      ),h AS(SELECT "txId",MAX(fee) fee FROM e GROUP BY "txId") SELECT COUNT(*)::bigint total,COALESCE(SUM(fee),0) fee FROM h
    `) : []
    const latest = await prisma.$queryRaw<Array<{ latest: Date | null }>>(Prisma.sql`
      SELECT MAX("timestamp") latest FROM (
        SELECT "timestamp" FROM "TransactionDetail" WHERE LOWER("tokenAddress")=ANY(${scoped})
        UNION ALL SELECT d."timestamp" FROM "RedemptionTransactionDetail" d WHERE LOWER(d."tokenAddress")=ANY(${kap721}) ${nftAssociation}
      ) x
    `)
    const previousPlain = new Map(previousRows.filter((r) => !r.token_address).map((r) => [r.metric, r.total]))
    const previousPoints = new Map(previousRows.filter((r) => r.token_address).map((r) => [r.token_address, r.total]))
    const previousNftMap = new Map(previousNfts.map((r) => [r.metric, r.total]))
    const comparison = (current: string, previous: string): { change: number | null; changeLabel: string } => {
      if (!previousRange) return { change: null, changeLabel: '' }
      const before = new Prisma.Decimal(previous); const now = new Prisma.Decimal(current)
      return { change: before.isZero() ? (now.isZero() ? 0 : null) : now.sub(before).div(before.abs()).mul(100).toDecimalPlaces(1).toNumber(), changeLabel: before.isZero() && !now.isZero() ? 'มีกิจกรรมใหม่เมื่อเทียบกับช่วงก่อนหน้า' : 'เทียบกับช่วงก่อนหน้าที่มีระยะเวลาเท่ากัน' }
    }
    const summary = summaryResult[0] ?? { daily: [], total_transactions: BigInt(0), total_fee: new Prisma.Decimal(0), today_transactions: BigInt(0), yesterday_transactions: BigInt(0), today_fee: new Prisma.Decimal(0), yesterday_fee: new Prisma.Decimal(0) }
    const plainAmounts = new Map(amounts.filter((r) => !r.token_address).map((r) => [r.metric, r]))
    const kap22Amounts = new Map(amounts.filter((r) => r.token_address).map((r) => [r.token_address as string, r]))
    const nftMap = new Map(nfts.map((r) => [r.metric, r]))
    const amountMetric = (key: string) => { const value = dec(plainAmounts.get(key)?.total).toString(); return { value, ...comparison(value, dec(previousPlain.get(key)).toString()) } }
    const nftMetric = (key: string) => { const value = String(nftMap.get(key)?.total ?? BigInt(0)); return { value, ...comparison(value, String(previousNftMap.get(key) ?? BigInt(0))) } }
    const total = Number(countResult[0]?.count ?? BigInt(0))
    const tokenByAddress = new Map(tokens.map((token) => [token.normalizedAddress.toLowerCase(), token]))
    const kap20Token = selectedKap20
    const nftTokens = tokens.filter((token) => token.standard?.toUpperCase() === 'KAP-721')
    const nftToken = nftTokens.find((token) => token.workspaceId === workspace) ?? nftTokens[0]
    const canonicalOrder = new Map(['FIT', 'GRN', 'INT', 'TGT'].map((symbol, index) => [symbol, index]))
    const orderedKap22 = [...kap22Tokens].sort((a, b) => (canonicalOrder.get((a.symbol ?? '').toUpperCase()) ?? 100) - (canonicalOrder.get((b.symbol ?? '').toUpperCase()) ?? 100) || (a.symbol ?? a.name).localeCompare(b.symbol ?? b.name))
    const tokenImage = (token: typeof tokens[number] | undefined): string | null => token?.imageKey ? `/api/contracts/token/${token.id}/image` : null
    const hiddenMetric = { value: '0', change: 0 }
    const grossRedeemed = amountMetric('kap20Redeemed')
    const redemptionFee = amountMetric('kap20Fee')
    const netValue = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(grossRedeemed.value).sub(redemptionFee.value)).toString()
    const netPrevious = Prisma.Decimal.max(new Prisma.Decimal(0), dec(previousPlain.get('kap20Redeemed')).sub(dec(previousPlain.get('kap20Fee')))).toString()
    const netRedeemed = { value: netValue, ...comparison(netValue, netPrevious) }
    // Both granularities come from the same deduplicated headers and statement snapshot as the KPI.
    const dailyByLabel = new Map(summary.daily.map((point) => [point.label, point.value]))
    const daily: TimelinePoint[] = []
    const monthlyByLabel = new Map<string, number>()
    const dayEnd = new Date(`${range.to}T00:00:00Z`)
    for (const cursor = new Date(`${range.from}T00:00:00Z`); cursor <= dayEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const label = cursor.toISOString().slice(0, 10)
      const value = dailyByLabel.get(label) ?? 0
      daily.push({ label, value })
      const month = label.slice(0, 7)
      monthlyByLabel.set(month, (monthlyByLabel.get(month) ?? 0) + value)
    }
    const monthly = [...monthlyByLabel].map(([label, value]) => ({ label, value }))
    return NextResponse.json({ timezone: TIME_ZONE, period: { from: range.from, to: range.to }, dataThrough: latest[0]?.latest?.toISOString() ?? null, comparison: previousRange ? { from: previousRange.from, to: previousRange.to } : null, kpis: {
      totalTransactions: canAccessChart(admin, 'overview.total-transactions') ? { value: String(summary.total_transactions), ...comparison(String(summary.total_transactions), String(previousHeaders[0]?.total ?? 0)) } : hiddenMetric,
      dailyGasFee: hiddenMetric,
      totalGasFee: canAccessChart(admin, 'overview.total-gas-fee') ? { value: dec(summary.total_fee).toFixed(3), ...comparison(dec(summary.total_fee).toString(), dec(previousHeaders[0]?.fee).toString()) } : hiddenMetric,
      kap20Distributed: canAccessChart(admin, 'overview.token-distributed') ? { ...amountMetric('kap20Distributed'), imageUrl: tokenImage(kap20Token), symbol: kap20Token?.symbol ?? 'KAP-20' } : hiddenMetric,
      kap20Redeemed: canAccessChart(admin, 'overview.token-redeemed') ? { ...netRedeemed, imageUrl: tokenImage(kap20Token), symbol: kap20Token?.symbol ?? 'KAP-20' } : hiddenMetric,
      redemptionFee: canAccessChart(admin, 'overview.redemption-fee') ? { ...redemptionFee, imageUrl: tokenImage(kap20Token), symbol: kap20Token?.symbol ?? 'KAP-20' } : hiddenMetric,
      kap22: canAccessChart(admin, 'overview.point-token-distributed') ? orderedKap22.map((t) => { const r = kap22Amounts.get(t.normalizedAddress.toLowerCase()); return { symbol: t.symbol || t.name, imageUrl: tokenImage(t), value: dec(r?.total).toString(), ...comparison(dec(r?.total).toString(), dec(previousPoints.get(t.normalizedAddress.toLowerCase())).toString()) } }) : [],
      nftMint: canAccessChart(admin, 'overview.nft-mint') ? { ...nftMetric('mint'), imageUrl: tokenImage(nftToken) } : hiddenMetric,
      nftBurn: canAccessChart(admin, 'overview.nft-burn') ? { ...nftMetric('burn'), imageUrl: tokenImage(nftToken) } : hiddenMetric,
    }, timeline: { monthly: showMonthly ? monthly : [], daily: showMonthly ? daily : [] },
    transactions: showHistory ? { rows: rows.map((r) => ({ key:r.key,txId:r.tx_id,timestamp:r.timestamp.toISOString(),fromHash:r.from_hash,toHash:r.to_hash,fromName:names.get(r.from_hash.toLowerCase())??null,toName:names.get(r.to_hash.toLowerCase())??null,tokenAddress:r.token_address,tokenName:r.token_name,tokenSymbol:r.token_symbol,standard:r.standard,type:r.type,value:r.value,tokenId:r.token_id,status:r.status,imageUrl:r.standard === 'KAP-721' && r.token_id ? `/api/reports/nft-redemptions/image?workspace=${workspace}&contract=${encodeURIComponent(r.token_address)}&tokenId=${encodeURIComponent(r.token_id)}` : tokenImage(tokenByAddress.get(r.token_address)) })), total, page, totalPages: Math.max(1,Math.ceil(total/LIMIT)) } : { rows: [], total: 0, page: 1, totalPages: 1 } })
  } catch (error) {
    if (error instanceof ReportPeriodError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('Overview report error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Failed to load overview report' }, { status: 500 })
  }
}
