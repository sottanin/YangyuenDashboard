import { Prisma, type Wallet } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'
import { getWorkspaceReportScope, isSelectableReportWorkspace, parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { getReportingConfig } from '@/lib/system/config'
import { walletBalanceFieldForTokenAddress, walletExpiredBalanceFieldForTokenAddress } from '@/lib/walletBalances'

const ZERO = '0x0000000000000000000000000000000000000000'
const LIMIT = 20
const MAX_PAGE = 10_000
const MAX_MONTHLY_CHART_MONTHS = 120
const MAX_MAPPING_FAN_OUT = 100
interface TotalRow { total: bigint }
interface AmountRow { metric: string; total: Prisma.Decimal }
interface PointAmountRow { metric: string; token_address: string; total: Prisma.Decimal }
interface CountRow { count: bigint }
interface MonthlyTotalRow { month: Date; total: bigint }
interface HistoryRow { key: string; tx_id: string; timestamp: Date; from_hash: string; to_hash: string; token_address: string; token_name: string; token_symbol: string; standard: string; type: string; value: string; token_id: string | null; token_value: Prisma.Decimal | null; status: string | null }
interface FitivityDailyRow { date: string; metric: string; total: Prisma.Decimal; user_count: bigint }
interface FitivityHistoryRow { id: string; date: Date; metric_type: string; total_value: Prisma.Decimal; unit: string }

function array(values: string[]): Prisma.Sql { return values.length ? Prisma.sql`ARRAY[${Prisma.join(values.map((value) => value.toLowerCase()))}]::text[]` : Prisma.sql`ARRAY[]::text[]` }
function decimal(value?: Prisma.Decimal): string { return (value ?? new Prisma.Decimal(0)).toString() }
function page(value: string | null): number { const parsed = /^\d+$/.test(value ?? '') ? Number(value) : 1; return Math.min(MAX_PAGE, Math.max(1, Number.isSafeInteger(parsed) ? parsed : 1)) }
function search(value: string | null): string { return (value ?? '').trim().slice(0, 128) }
function like(value: string): string { return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%` }

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessMenu(admin, 'wallets')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const visible = (key: string): boolean => canAccessChart(admin, `wallet-activity.${key}`)
    const canViewFitivity = ['steps-trend', 'calories-trend', 'sleep-trend', 'fitivity-history'].some(visible)
    const chartKeys = ['total-transactions', 'token-activity', 'point-token-activity', 'nft-activity', 'token-balance', 'point-token-balance', 'steps-trend', 'calories-trend', 'sleep-trend', 'transaction-history', 'redemption-history', 'fitivity-history']
    if (!chartKeys.some(visible)) return NextResponse.json({ error: 'No Wallet Activity charts are assigned' }, { status: 403 })
    const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
    if (workspace === null || workspace === 'all') return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    if (!await isSelectableReportWorkspace(workspace)) return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    const rawQuery = (request.nextUrl.searchParams.get('wallet') ?? '').trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(rawQuery)) return NextResponse.json({ error: 'Enter a valid Wallet Address (0x followed by 40 hexadecimal characters).' }, { status: 400 })
    const normalizedQuery = rawQuery.toLowerCase()
    const mappings = canViewFitivity ? await prisma.walletMapping.findMany({
      where: { workspaceId: workspace, normalizedWalletAddress: normalizedQuery },
      select: { userId: true, normalizedUserId: true, walletAddress: true, normalizedWalletAddress: true },
      orderBy: [{ normalizedUserId: 'asc' }, { normalizedWalletAddress: 'asc' }],
      take: MAX_MAPPING_FAN_OUT + 1,
    }) : []
    if (mappings.length > MAX_MAPPING_FAN_OUT) return NextResponse.json({ error: 'This identity has too many Wallet Mapping records. Narrow or correct the mappings before continuing.' }, { status: 409 })
    const walletAddresses = [rawQuery]
    const normalizedWallets = walletAddresses.map((value) => value.toLowerCase())
    const userIds = Array.from(new Map(mappings.map((mapping) => [mapping.normalizedUserId, mapping.userId] as const)).values())
    const selectedUserInput = (request.nextUrl.searchParams.get('selectedUser') ?? '').trim()
    const normalizedSelectedUser = selectedUserInput.toLowerCase()
    if (selectedUserInput && (!canViewFitivity || !userIds.some((value) => value.toLowerCase() === normalizedSelectedUser))) return NextResponse.json({ error: 'Selected User ID is not linked to this identity' }, { status: 400 })
    const resolvedUserIds = !canViewFitivity ? [] : selectedUserInput ? userIds.filter((value) => value.toLowerCase() === normalizedSelectedUser) : userIds.length === 1 ? userIds : []
    const normalizedUserIds = resolvedUserIds.map((value) => value.toLowerCase())
    const walletSet = array(normalizedWallets)
    const userSet = array(normalizedUserIds)
    const requestedTxPage = page(request.nextUrl.searchParams.get('txPage'))
    const requestedRedemptionPage = page(request.nextUrl.searchParams.get('redemptionPage'))
    const requestedFitivityPage = page(request.nextUrl.searchParams.get('fitivityPage'))
    const txSearch = search(request.nextUrl.searchParams.get('txSearch'))
    const redemptionSearch = search(request.nextUrl.searchParams.get('redemptionSearch'))
    if (txSearch.length === 1 || redemptionSearch.length === 1) return NextResponse.json({ error: 'Search must contain at least 2 characters' }, { status: 400 })

    const [scope, config, tokens, addresses, globallyRegisteredTokenAddresses, globallyRegisteredSystemAddresses, snapshots] = await Promise.all([
      getWorkspaceReportScope(workspace), getReportingConfig(),
      prisma.tokenContract.findMany({ where: { OR: [{ workspaceId: workspace }, { active: true, standard: 'KAP-721', aggregateAcrossWorkspaces: true }] }, select: { id: true, workspaceId: true, normalizedAddress: true, name: true, symbol: true, standard: true, active: true, imageKey: true, chartColor: true }, orderBy: { normalizedAddress: 'asc' } }),
      prisma.addressContract.findMany({ where: { active: true, OR: [{ workspaceId: workspace }, { workspaceId: null }, { workspace: { name: { equals: 'SYSTEM', mode: 'insensitive' } } }, { role: 'MARKETPLACE', aggregateAcrossWorkspaces: true }] }, select: { normalizedAddress: true, name: true, role: true } }),
      prisma.tokenContract.findMany({ select: { normalizedAddress: true } }),
      prisma.addressContract.findMany({ select: { normalizedAddress: true } }),
      (visible('token-balance') || visible('point-token-balance') || visible('token-activity') || visible('point-token-activity')) ? prisma.$queryRaw<Wallet[]>(Prisma.sql`SELECT DISTINCT ON (LOWER("walletId")) * FROM "Wallet" WHERE LOWER("walletId")=ANY(${walletSet}) ORDER BY LOWER("walletId"),"timestamp" DESC NULLS LAST,id DESC`) : Promise.resolve([] as Wallet[]),
    ])
    const start = new Date(config.businessHistoryStart)
    const crossWorkspaceNfts = tokens.filter((token) => token.active && token.standard?.toUpperCase() === 'KAP-721').map((token) => token.normalizedAddress)
    const scoped = array(Array.from(new Set([...(scope.tokenAddresses ?? []), ...crossWorkspaceNfts])))
    const roles = (wanted: string[]): string[] => addresses.filter((item) => wanted.includes(item.role.toUpperCase())).map((item) => item.normalizedAddress)
    const swaps = array(roles(['LOYALTY_SWAP'])); const markets = array(roles(['LOYALTY_MARKETPLACE', 'MARKETPLACE'])); const pools = array(roles(['DISTRIBUTOR_POOL', 'DISTRIBUTORPOOL', 'OPERATION_POOL', 'OPERATIONPOOL']))
    const kap20Tokens = tokens.filter((token) => token.standard?.toUpperCase() === 'KAP-20'); const kap22Tokens = tokens.filter((token) => token.active && token.standard?.toUpperCase() === 'KAP-22')
    const kap20 = array(kap20Tokens.map((token) => token.normalizedAddress)); const kap22 = array(kap22Tokens.map((token) => token.normalizedAddress)); const kap721 = array(tokens.filter((token) => token.active && token.standard?.toUpperCase() === 'KAP-721').map((token) => token.normalizedAddress))
    const registered = array(Array.from(new Set([
      ...globallyRegisteredTokenAddresses.map((token) => token.normalizedAddress),
      ...globallyRegisteredSystemAddresses.map((address) => address.normalizedAddress),
      ZERO,
    ])))
    const txPattern = like(txSearch); const redemptionPattern = like(redemptionSearch)
    const txFilter = txSearch ? Prisma.sql`(d."txId" ILIKE ${txPattern} ESCAPE '\\' OR d."fromHash" ILIKE ${txPattern} ESCAPE '\\' OR d."toHash" ILIKE ${txPattern} ESCAPE '\\' OR d."tokenName" ILIKE ${txPattern} ESCAPE '\\' OR d."tokenSymbol" ILIKE ${txPattern} ESCAPE '\\')` : Prisma.sql`TRUE`
    const redemptionFilter = redemptionSearch ? Prisma.sql`(d."txId" ILIKE ${redemptionPattern} ESCAPE '\\' OR d."fromHash" ILIKE ${redemptionPattern} ESCAPE '\\' OR d."toHash" ILIKE ${redemptionPattern} ESCAPE '\\' OR d."tokenName" ILIKE ${redemptionPattern} ESCAPE '\\' OR d."tokenSymbol" ILIKE ${redemptionPattern} ESCAPE '\\' OR d."tokenId" ILIKE ${redemptionPattern} ESCAPE '\\')` : Prisma.sql`TRUE`

    const [totalRows, monthlyRows, tokenRows, pointRows, nftRows, txCounts, redemptionCounts] = await Promise.all([
      visible('total-transactions') ? prisma.$queryRaw<TotalRow[]>(Prisma.sql`WITH h AS (SELECT 'token',x."txId" FROM "TransactionHeader" x WHERE x."timestamp">=${start} AND EXISTS(SELECT 1 FROM "TransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}) AND (LOWER(d."fromHash")=ANY(${walletSet}) OR LOWER(d."toHash")=ANY(${walletSet}))) UNION ALL SELECT 'nft',x."txId" FROM "RedemptionTransactionHeader" x WHERE x."timestamp">=${start} AND EXISTS(SELECT 1 FROM "RedemptionTransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}) AND (LOWER(d."fromHash")=ANY(${walletSet}) OR LOWER(d."toHash")=ANY(${walletSet})))) SELECT COUNT(*)::bigint total FROM h`) : Promise.resolve([] as TotalRow[]),
      visible('total-transactions') ? prisma.$queryRaw<MonthlyTotalRow[]>(Prisma.sql`WITH bounds AS (SELECT GREATEST(date_trunc('month', ${start}::timestamptz AT TIME ZONE ${config.reportingTimezone}), date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE ${config.reportingTimezone}) - (${MAX_MONTHLY_CHART_MONTHS - 1} * interval '1 month')) AS chart_start, date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE ${config.reportingTimezone}) AS chart_end), months AS (SELECT generate_series(chart_start, chart_end, interval '1 month') AS bucket FROM bounds), events AS (SELECT date_trunc('month', x."timestamp" AT TIME ZONE ${config.reportingTimezone}) AS bucket, 'token:'||x."txId" AS event_id FROM "TransactionHeader" x CROSS JOIN bounds WHERE x."timestamp">=(bounds.chart_start AT TIME ZONE ${config.reportingTimezone}) AND EXISTS(SELECT 1 FROM "TransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}) AND (LOWER(d."fromHash")=ANY(${walletSet}) OR LOWER(d."toHash")=ANY(${walletSet}))) UNION ALL SELECT date_trunc('month', x."timestamp" AT TIME ZONE ${config.reportingTimezone}) AS bucket, 'nft:'||x."txId" AS event_id FROM "RedemptionTransactionHeader" x CROSS JOIN bounds WHERE x."timestamp">=(bounds.chart_start AT TIME ZONE ${config.reportingTimezone}) AND EXISTS(SELECT 1 FROM "RedemptionTransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}) AND (LOWER(d."fromHash")=ANY(${walletSet}) OR LOWER(d."toHash")=ANY(${walletSet})))) SELECT months.bucket AS month, COUNT(DISTINCT events.event_id)::bigint AS total FROM months LEFT JOIN events USING(bucket) GROUP BY months.bucket ORDER BY months.bucket`) : Promise.resolve([] as MonthlyTotalRow[]),
      visible('token-activity') ? prisma.$queryRaw<AmountRow[]>(Prisma.sql`WITH e AS(SELECT LOWER("tokenAddress") token_address,LOWER("fromHash") from_hash,LOWER("toHash") to_hash,value FROM "TransactionDetail" WHERE "timestamp">=${start} AND LOWER("tokenAddress")=ANY(${scoped})),m AS(SELECT 'received'::text metric,value FROM e WHERE token_address=ANY(${kap20}) AND to_hash=ANY(${walletSet}) AND NOT(from_hash=ANY(${walletSet})) AND (from_hash=ANY(${swaps}) OR NOT(from_hash=ANY(${registered}))) UNION ALL SELECT 'burn',value FROM e WHERE token_address=ANY(${kap20}) AND from_hash=ANY(${walletSet}) AND to_hash=ANY(${markets}) AND NOT(from_hash=ANY(${registered})) UNION ALL SELECT 'transfer',value FROM e WHERE token_address=ANY(${kap20}) AND from_hash=ANY(${walletSet}) AND NOT(to_hash=ANY(${walletSet})) AND NOT(to_hash=ANY(${registered}))) SELECT metric,COALESCE(SUM(value),0) total FROM m GROUP BY metric`) : Promise.resolve([] as AmountRow[]),
      visible('point-token-activity') ? prisma.$queryRaw<PointAmountRow[]>(Prisma.sql`WITH e AS(SELECT LOWER("tokenAddress") token_address,LOWER("fromHash") from_hash,LOWER("toHash") to_hash,value FROM "TransactionDetail" WHERE "timestamp">=${start} AND LOWER("tokenAddress")=ANY(${kap22})),m AS(SELECT 'received'::text metric,token_address,value FROM e WHERE to_hash=ANY(${walletSet}) AND NOT(from_hash=ANY(${walletSet})) AND (from_hash=ANY(${pools}) OR NOT(from_hash=ANY(${registered}))) UNION ALL SELECT 'burn',token_address,value FROM e WHERE from_hash=ANY(${walletSet}) AND to_hash=ANY(${swaps}) AND NOT(from_hash=ANY(${registered})) UNION ALL SELECT 'transfer',token_address,value FROM e WHERE from_hash=ANY(${walletSet}) AND NOT(to_hash=ANY(${walletSet})) AND NOT(to_hash=ANY(${registered}))) SELECT metric,token_address,COALESCE(SUM(value),0) total FROM m GROUP BY metric,token_address`) : Promise.resolve([] as PointAmountRow[]),
      visible('nft-activity') ? prisma.$queryRaw<Array<CountRow & { metric: string }>>(Prisma.sql`WITH e AS(SELECT LOWER("fromHash") from_hash,LOWER("toHash") to_hash FROM "RedemptionTransactionDetail" WHERE "timestamp">=${start} AND LOWER("tokenAddress")=ANY(${kap721})),m AS(SELECT 'received'::text metric FROM e WHERE from_hash=${ZERO} AND to_hash=ANY(${walletSet}) UNION ALL SELECT 'burn' FROM e WHERE from_hash=ANY(${walletSet}) AND to_hash=${ZERO}) SELECT metric,COUNT(*)::bigint count FROM m GROUP BY metric`) : Promise.resolve([] as Array<CountRow & { metric: string }>),
      visible('transaction-history') ? prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint count FROM "TransactionDetail" d WHERE d."timestamp">=${start} AND (LOWER(d."tokenAddress")=ANY(${kap20}) OR LOWER(d."tokenAddress")=ANY(${kap22})) AND (LOWER(d."fromHash")=ANY(${walletSet}) OR LOWER(d."toHash")=ANY(${walletSet})) AND ${txFilter}`) : Promise.resolve([] as CountRow[]),
      visible('redemption-history') ? prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint count FROM "RedemptionTransactionDetail" d WHERE d."timestamp">=${start} AND LOWER(d."tokenAddress")=ANY(${kap721}) AND LOWER(d."fromHash")=${ZERO} AND LOWER(d."toHash")=ANY(${walletSet}) AND d."tokenId" IS NOT NULL AND ${redemptionFilter}`) : Promise.resolve([] as CountRow[]),
    ])
    const txTotal = Number(txCounts[0]?.count ?? 0); const txPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(txTotal / LIMIT))); const txPage = Math.min(requestedTxPage, txPages)
    const redemptionTotal = Number(redemptionCounts[0]?.count ?? 0); const redemptionPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(redemptionTotal / LIMIT))); const redemptionPage = Math.min(requestedRedemptionPage, redemptionPages)
    const [fitivityDailyRows, fitivityCounts] = await Promise.all([
      normalizedUserIds.length && ['steps-trend', 'calories-trend', 'sleep-trend'].some(visible) ? prisma.$queryRaw<FitivityDailyRow[]>(Prisma.sql`
        WITH base AS (
          SELECT date,"userId",
            CASE WHEN "metricType"='steps' THEN 'steps' WHEN "metricType"='active_energy_burned' THEN 'calories' ELSE 'sleep' END metric,
            CASE WHEN "metricType" IN ('sleep_deep','sleep_light','sleep_rem') THEN "totalValue"/60 ELSE "totalValue" END value
          FROM "FitivityData"
          WHERE "workspaceId"=${workspace} AND "isCal"=true AND LOWER("userId")=ANY(${userSet})
            AND (("metricType"='steps' AND ${visible('steps-trend')}) OR ("metricType"='active_energy_burned' AND ${visible('calories-trend')}) OR ("metricType" IN ('sleep_deep','sleep_light','sleep_rem') AND ${visible('sleep-trend')}))
            AND "metricType" IN ('steps','active_energy_burned','sleep_deep','sleep_light','sleep_rem')
        )
        SELECT TO_CHAR(date,'YYYY-MM-DD') date,metric,SUM(value) total,COUNT(DISTINCT "userId")::bigint user_count FROM base GROUP BY date,metric ORDER BY date
      `) : Promise.resolve([] as FitivityDailyRow[]),
      normalizedUserIds.length && visible('fitivity-history') ? prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint count FROM "FitivityData" WHERE "workspaceId"=${workspace} AND LOWER("userId")=ANY(${userSet})`) : Promise.resolve([] as CountRow[]),
    ])
    const fitivityTotal = Number(fitivityCounts[0]?.count ?? 0); const fitivityPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(fitivityTotal / LIMIT))); const fitivityPage = Math.min(requestedFitivityPage, fitivityPages)
    const [txRows, redemptionRows, fitivityRows] = await Promise.all([
      visible('transaction-history') ? prisma.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT 'kap-'||d.key key,d."txId" tx_id,d."timestamp",d."fromHash" from_hash,d."toHash" to_hash,LOWER(d."tokenAddress") token_address,d."tokenName" token_name,d."tokenSymbol" token_symbol,COALESCE(t.standard,d."txType") standard,CASE WHEN LOWER(d."fromHash")=${ZERO} THEN 'Mint' WHEN LOWER(d."toHash")=${ZERO} THEN 'Burn' ELSE 'Transfer' END type,d.value::text value,NULL::text token_id,NULL::numeric token_value,h.status FROM "TransactionDetail" d JOIN "TransactionHeader" h USING("txId") LEFT JOIN "TokenContract" t ON t."normalizedAddress"=LOWER(d."tokenAddress") AND t."workspaceId"=${workspace} WHERE d."timestamp">=${start} AND (LOWER(d."tokenAddress")=ANY(${kap20}) OR LOWER(d."tokenAddress")=ANY(${kap22})) AND (LOWER(d."fromHash")=ANY(${walletSet}) OR LOWER(d."toHash")=ANY(${walletSet})) AND ${txFilter} ORDER BY d."timestamp" DESC,d.key DESC OFFSET ${(txPage - 1) * LIMIT} LIMIT ${LIMIT}`) : Promise.resolve([] as HistoryRow[]),
      visible('redemption-history') ? prisma.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT 'nft-'||d.key key,d."txId" tx_id,d."timestamp",d."fromHash" from_hash,d."toHash" to_hash,LOWER(d."tokenAddress") token_address,COALESCE(NULLIF(n.name,''),d."tokenName") token_name,d."tokenSymbol" token_symbol,'KAP-721' standard,'Mint' type,'1' value,d."tokenId" token_id,n."tokenValue" token_value,h.status FROM "RedemptionTransactionDetail" d JOIN "RedemptionTransactionHeader" h USING("txId") LEFT JOIN "NFTInstance" n ON n."normalizedTokenAddress"=LOWER(d."tokenAddress") AND n.id=d."tokenId" WHERE d."timestamp">=${start} AND LOWER(d."tokenAddress")=ANY(${kap721}) AND LOWER(d."fromHash")=${ZERO} AND LOWER(d."toHash")=ANY(${walletSet}) AND d."tokenId" IS NOT NULL AND ${redemptionFilter} ORDER BY d."timestamp" DESC,d.key DESC OFFSET ${(redemptionPage - 1) * LIMIT} LIMIT ${LIMIT}`) : Promise.resolve([] as HistoryRow[]),
      normalizedUserIds.length && visible('fitivity-history') ? prisma.$queryRaw<FitivityHistoryRow[]>(Prisma.sql`SELECT id,date,"metricType" metric_type,"totalValue" total_value,unit FROM "FitivityData" WHERE "workspaceId"=${workspace} AND LOWER("userId")=ANY(${userSet}) ORDER BY date DESC,"metricType",id OFFSET ${(fitivityPage - 1) * LIMIT} LIMIT ${LIMIT}`) : Promise.resolve([] as FitivityHistoryRow[]),
    ])
    const tokenTotals = new Map(tokenRows.map((row) => [row.metric, row.total])); const pointTotals = new Map(pointRows.map((row) => [`${row.metric}:${row.token_address}`, row.total])); const nftTotals = new Map(nftRows.map((row) => [row.metric, row.count])); const names = new Map(addresses.map((item) => [item.normalizedAddress.toLowerCase(), item.name])); const byAddress = new Map(tokens.map((token) => [token.normalizedAddress.toLowerCase(), token]))
    const image = (token: typeof tokens[number] | undefined): string | null => token?.imageKey ? `/api/reports/wallet-activity/token-image/${token.id}?workspace=${workspace}` : null
    const order = new Map(['FIT','GRN','INT','TGT'].map((symbol,index)=>[symbol,index])); const points = kap22Tokens.filter((token)=>token.active).sort((a,b)=>(order.get((a.symbol??'').toUpperCase())??100)-(order.get((b.symbol??'').toUpperCase())??100)); const primary = kap20Tokens.find((token)=>token.active); const nftTokens=tokens.filter((token)=>token.active&&token.standard?.toUpperCase()==='KAP-721'); const nft=nftTokens.find((token)=>token.workspaceId===workspace)??nftTokens.find((token)=>token.imageKey)??nftTokens[0]; const nftImage=nft?.imageKey?`/api/reports/wallet-activity/nft-image?workspace=${workspace}&contract=${encodeURIComponent(nft.normalizedAddress)}`:null; const syncedAt=snapshots.reduce<Date|null>((latest,item)=>item.timestamp&&(!latest||item.timestamp>latest)?item.timestamp:latest,null)
    const balance = (token: typeof tokens[number] | undefined): string | null => { const field=token?walletBalanceFieldForTokenAddress(token.normalizedAddress):null; return snapshots.length&&field?snapshots.reduce((sum,item)=>sum.add(item[field]),new Prisma.Decimal(0)).toString():null }
    const expiredBalance = (token: typeof tokens[number]): string | null => { const field=walletExpiredBalanceFieldForTokenAddress(token.normalizedAddress); return snapshots.length&&field?snapshots.reduce((sum,item)=>sum.add(item[field]),new Prisma.Decimal(0)).toString():null }
    const mapRow=(row:HistoryRow)=>({key:row.key,txId:row.tx_id,timestamp:row.timestamp.toISOString(),fromHash:row.from_hash,toHash:row.to_hash,fromName:names.get(row.from_hash.toLowerCase())??null,toName:names.get(row.to_hash.toLowerCase())??null,tokenAddress:row.token_address,tokenName:row.token_name,tokenSymbol:row.token_symbol,standard:row.standard,type:row.type,value:row.value,tokenId:row.token_id,tokenValue:row.token_value?.toString()??null,status:row.status,imageUrl:row.standard==='KAP-721'&&row.token_id?`/api/reports/wallet-activity/nft-image?workspace=${workspace}&contract=${encodeURIComponent(row.token_address)}&tokenId=${encodeURIComponent(row.token_id)}`:image(byAddress.get(row.token_address))})
    const trends = new Map<string, Array<{ date: string; average: string; accumulated: string }>>()
    const running = new Map<string, Prisma.Decimal>()
    for (const row of fitivityDailyRows) { const accumulated=(running.get(row.metric)??new Prisma.Decimal(0)).add(row.total); running.set(row.metric,accumulated); const values=trends.get(row.metric)??[]; values.push({date:row.date,average:row.user_count===BigInt(0)?'0':row.total.div(row.user_count.toString()).toString(),accumulated:accumulated.toString()}); trends.set(row.metric,values) }
    const fitivityStatus = !canViewFitivity ? 'blocked' : userIds.length === 0 ? 'unmapped' : resolvedUserIds.length === 0 ? 'ambiguous' : 'ready'
    const response = {query:rawQuery,wallet:walletAddresses[0]??rawQuery,wallets:walletAddresses,healthAccess:{allowed:canViewFitivity,status:fitivityStatus,userOptions:canViewFitivity?userIds:[],selectedUser:resolvedUserIds[0]??null},timezone:config.reportingTimezone,historyStart:start.toISOString(),hasWalletSnapshot:snapshots.length>0,syncedAt:syncedAt?.toISOString()??null,kpis:{totalTransactions:String(totalRows[0]?.total??0),monthlyTransactions:monthlyRows.map((row)=>({month:row.month.toISOString().slice(0,7),total:Number(row.total)})),tokenActivity:{received:decimal(tokenTotals.get('received')),burn:decimal(tokenTotals.get('burn')),transfer:decimal(tokenTotals.get('transfer')),name:primary?.name??'KAP-20 Token',symbol:primary?.symbol??'KAP-20',imageUrl:image(primary),chartColor:primary?.chartColor},pointTokenActivity:points.map((token)=>({name:token.name,symbol:token.symbol||token.name,received:decimal(pointTotals.get(`received:${token.normalizedAddress.toLowerCase()}`)),burn:decimal(pointTotals.get(`burn:${token.normalizedAddress.toLowerCase()}`)),transfer:decimal(pointTotals.get(`transfer:${token.normalizedAddress.toLowerCase()}`)),expired:expiredBalance(token),imageUrl:image(token),chartColor:token.chartColor})),nftActivity:{received:String(nftTotals.get('received')??0),burn:String(nftTotals.get('burn')??0),symbol:nft?.symbol??nft?.name??'NFT',imageUrl:nftImage},tokenBalance:{name:primary?.name??'KAP-20 Token',value:balance(primary),symbol:primary?.symbol??'KAP-20',imageUrl:image(primary),chartColor:primary?.chartColor},pointTokenBalance:points.map((token)=>({name:token.name,symbol:token.symbol||token.name,value:balance(token),imageUrl:image(token),chartColor:token.chartColor}))},fitivityTrends:{steps:trends.get('steps')??[],calories:trends.get('calories')??[],sleep:trends.get('sleep')??[]},fitivityHistory:{rows:fitivityRows.map((row)=>({id:row.id,date:row.date.toISOString().slice(0,10),walletAddresses,metricType:row.metric_type,value:row.total_value.toString(),unit:row.unit})),total:fitivityTotal,page:fitivityPage,totalPages:fitivityPages},transactionHistory:{rows:txRows.map(mapRow),total:txTotal,page:txPage,totalPages:txPages},redemptionHistory:{rows:redemptionRows.map(mapRow),total:redemptionTotal,page:redemptionPage,totalPages:redemptionPages}}
    const protectedResponse = { ...response, visibility: Object.fromEntries(chartKeys.map((key) => [key, visible(key)])), kpis: { ...response.kpis } }
    const kpiPermissions = { totalTransactions: 'total-transactions', monthlyTransactions: 'total-transactions', tokenActivity: 'token-activity', pointTokenActivity: 'point-token-activity', nftActivity: 'nft-activity', tokenBalance: 'token-balance', pointTokenBalance: 'point-token-balance' } as const
    for (const [field, permission] of Object.entries(kpiPermissions)) { if (!visible(permission)) Reflect.deleteProperty(protectedResponse.kpis, field) }
    if (!visible('token-balance') && visible('token-activity')) { protectedResponse.kpis.tokenBalance = { ...response.kpis.tokenBalance, value: null } }
    if (!visible('point-token-activity')) protectedResponse.kpis.pointTokenActivity = []
    return NextResponse.json(protectedResponse)
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('Wallet activity report error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Failed to load wallet activity report' }, { status: 500 })
  }
}
