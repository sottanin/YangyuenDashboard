import { Prisma, type Wallet } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'
import { getWorkspaceReportScope, isSelectableReportWorkspace, parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { getReportingConfig } from '@/lib/system/config'
import { walletBalanceFieldForTokenAddress, walletExpiredBalanceFieldForTokenAddress } from '@/lib/walletBalances'

const ZERO = '0x0000000000000000000000000000000000000000'
const LIMIT = 20
const MAX_PAGE = 10_000
const MAX_MONTHLY_CHART_MONTHS = 120
interface TotalRow { total: bigint }
interface AmountRow { metric: string; total: Prisma.Decimal }
interface PointAmountRow { metric: string; token_address: string; total: Prisma.Decimal }
interface CountRow { count: bigint }
interface MonthlyTotalRow { month: Date; total: bigint }
interface HistoryRow { key: string; tx_id: string; timestamp: Date; from_hash: string; to_hash: string; token_address: string; token_name: string; token_symbol: string; standard: string; type: string; value: string; token_id: string | null; status: string | null }

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
    const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
    if (workspace === null || workspace === 'all') return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    if (!await isSelectableReportWorkspace(workspace)) return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    const rawWallet = (request.nextUrl.searchParams.get('wallet') ?? '').trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(rawWallet)) return NextResponse.json({ error: 'Enter a valid EVM wallet address' }, { status: 400 })
    const wallet = rawWallet.toLowerCase()
    const requestedTxPage = page(request.nextUrl.searchParams.get('txPage'))
    const requestedRedemptionPage = page(request.nextUrl.searchParams.get('redemptionPage'))
    const txSearch = search(request.nextUrl.searchParams.get('txSearch'))
    const redemptionSearch = search(request.nextUrl.searchParams.get('redemptionSearch'))
    if (txSearch.length === 1 || redemptionSearch.length === 1) return NextResponse.json({ error: 'Search must contain at least 2 characters' }, { status: 400 })

    const [scope, config, tokens, addresses, globallyRegisteredTokenAddresses, globallyRegisteredSystemAddresses, snapshots] = await Promise.all([
      getWorkspaceReportScope(workspace), getReportingConfig(),
      prisma.tokenContract.findMany({ where: { OR: [{ workspaceId: workspace }, { active: true, standard: 'KAP-721', aggregateAcrossWorkspaces: true }] }, select: { id: true, workspaceId: true, normalizedAddress: true, name: true, symbol: true, standard: true, active: true, imageKey: true, chartColor: true }, orderBy: { normalizedAddress: 'asc' } }),
      prisma.addressContract.findMany({ where: { active: true, OR: [{ workspaceId: workspace }, { workspaceId: null }, { workspace: { name: { equals: 'SYSTEM', mode: 'insensitive' } } }, { role: 'MARKETPLACE', aggregateAcrossWorkspaces: true }] }, select: { normalizedAddress: true, name: true, role: true } }),
      prisma.tokenContract.findMany({ select: { normalizedAddress: true } }),
      prisma.addressContract.findMany({ select: { normalizedAddress: true } }),
      prisma.$queryRaw<Wallet[]>(Prisma.sql`SELECT * FROM "Wallet" WHERE LOWER("walletId")=${wallet} ORDER BY "timestamp" DESC NULLS LAST,id DESC LIMIT 1`),
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
      prisma.$queryRaw<TotalRow[]>(Prisma.sql`WITH h AS (SELECT 'token',x."txId" FROM "TransactionHeader" x WHERE x."timestamp">=${start} AND EXISTS(SELECT 1 FROM "TransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}) AND (LOWER(d."fromHash")=${wallet} OR LOWER(d."toHash")=${wallet})) UNION ALL SELECT 'nft',x."txId" FROM "RedemptionTransactionHeader" x WHERE x."timestamp">=${start} AND EXISTS(SELECT 1 FROM "RedemptionTransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}) AND (LOWER(d."fromHash")=${wallet} OR LOWER(d."toHash")=${wallet}))) SELECT COUNT(*)::bigint total FROM h`),
      prisma.$queryRaw<MonthlyTotalRow[]>(Prisma.sql`WITH bounds AS (SELECT GREATEST(date_trunc('month', ${start}::timestamptz AT TIME ZONE ${config.reportingTimezone}), date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE ${config.reportingTimezone}) - (${MAX_MONTHLY_CHART_MONTHS - 1} * interval '1 month')) AS chart_start, date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE ${config.reportingTimezone}) AS chart_end), months AS (SELECT generate_series(chart_start, chart_end, interval '1 month') AS bucket FROM bounds), events AS (SELECT date_trunc('month', x."timestamp" AT TIME ZONE ${config.reportingTimezone}) AS bucket, 'token:'||x."txId" AS event_id FROM "TransactionHeader" x CROSS JOIN bounds WHERE x."timestamp">=(bounds.chart_start AT TIME ZONE ${config.reportingTimezone}) AND EXISTS(SELECT 1 FROM "TransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}) AND (LOWER(d."fromHash")=${wallet} OR LOWER(d."toHash")=${wallet})) UNION ALL SELECT date_trunc('month', x."timestamp" AT TIME ZONE ${config.reportingTimezone}) AS bucket, 'nft:'||x."txId" AS event_id FROM "RedemptionTransactionHeader" x CROSS JOIN bounds WHERE x."timestamp">=(bounds.chart_start AT TIME ZONE ${config.reportingTimezone}) AND EXISTS(SELECT 1 FROM "RedemptionTransactionDetail" d WHERE d."txId"=x."txId" AND LOWER(d."tokenAddress")=ANY(${scoped}) AND (LOWER(d."fromHash")=${wallet} OR LOWER(d."toHash")=${wallet}))) SELECT months.bucket AS month, COUNT(DISTINCT events.event_id)::bigint AS total FROM months LEFT JOIN events USING(bucket) GROUP BY months.bucket ORDER BY months.bucket`),
      prisma.$queryRaw<AmountRow[]>(Prisma.sql`WITH e AS(SELECT LOWER("tokenAddress") token_address,LOWER("fromHash") from_hash,LOWER("toHash") to_hash,value FROM "TransactionDetail" WHERE "timestamp">=${start} AND LOWER("tokenAddress")=ANY(${scoped})),m AS(SELECT 'received'::text metric,value FROM e WHERE token_address=ANY(${kap20}) AND to_hash=${wallet} AND from_hash<>to_hash AND (from_hash=ANY(${swaps}) OR NOT(from_hash=ANY(${registered}))) UNION ALL SELECT 'burn',value FROM e WHERE token_address=ANY(${kap20}) AND from_hash=${wallet} AND to_hash=ANY(${markets}) AND NOT(from_hash=ANY(${registered})) UNION ALL SELECT 'transfer',value FROM e WHERE token_address=ANY(${kap20}) AND from_hash=${wallet} AND to_hash<>from_hash AND NOT(to_hash=ANY(${registered}))) SELECT metric,COALESCE(SUM(value),0) total FROM m GROUP BY metric`),
      prisma.$queryRaw<PointAmountRow[]>(Prisma.sql`WITH e AS(SELECT LOWER("tokenAddress") token_address,LOWER("fromHash") from_hash,LOWER("toHash") to_hash,value FROM "TransactionDetail" WHERE "timestamp">=${start} AND LOWER("tokenAddress")=ANY(${kap22})),m AS(SELECT 'received'::text metric,token_address,value FROM e WHERE to_hash=${wallet} AND from_hash<>to_hash AND (from_hash=ANY(${pools}) OR NOT(from_hash=ANY(${registered}))) UNION ALL SELECT 'burn',token_address,value FROM e WHERE from_hash=${wallet} AND to_hash=ANY(${swaps}) AND NOT(from_hash=ANY(${registered})) UNION ALL SELECT 'transfer',token_address,value FROM e WHERE from_hash=${wallet} AND to_hash<>from_hash AND NOT(to_hash=ANY(${registered}))) SELECT metric,token_address,COALESCE(SUM(value),0) total FROM m GROUP BY metric,token_address`),
      prisma.$queryRaw<Array<CountRow & { metric: string }>>(Prisma.sql`WITH e AS(SELECT LOWER("fromHash") from_hash,LOWER("toHash") to_hash FROM "RedemptionTransactionDetail" WHERE "timestamp">=${start} AND LOWER("tokenAddress")=ANY(${kap721})),m AS(SELECT 'received'::text metric FROM e WHERE from_hash=${ZERO} AND to_hash=${wallet} UNION ALL SELECT 'burn' FROM e WHERE from_hash=${wallet} AND to_hash=${ZERO}) SELECT metric,COUNT(*)::bigint count FROM m GROUP BY metric`),
      prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint count FROM "TransactionDetail" d WHERE d."timestamp">=${start} AND (LOWER(d."tokenAddress")=ANY(${kap20}) OR LOWER(d."tokenAddress")=ANY(${kap22})) AND (LOWER(d."fromHash")=${wallet} OR LOWER(d."toHash")=${wallet}) AND ${txFilter}`),
      prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint count FROM "RedemptionTransactionDetail" d WHERE d."timestamp">=${start} AND LOWER(d."tokenAddress")=ANY(${kap721}) AND LOWER(d."fromHash")=${ZERO} AND LOWER(d."toHash")=${wallet} AND d."tokenId" IS NOT NULL AND ${redemptionFilter}`),
    ])
    const txTotal = Number(txCounts[0]?.count ?? 0); const txPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(txTotal / LIMIT))); const txPage = Math.min(requestedTxPage, txPages)
    const redemptionTotal = Number(redemptionCounts[0]?.count ?? 0); const redemptionPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(redemptionTotal / LIMIT))); const redemptionPage = Math.min(requestedRedemptionPage, redemptionPages)
    const [txRows, redemptionRows] = await Promise.all([
      prisma.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT 'kap-'||d.key key,d."txId" tx_id,d."timestamp",d."fromHash" from_hash,d."toHash" to_hash,LOWER(d."tokenAddress") token_address,d."tokenName" token_name,d."tokenSymbol" token_symbol,COALESCE(t.standard,d."txType") standard,CASE WHEN LOWER(d."fromHash")=${ZERO} THEN 'Mint' WHEN LOWER(d."toHash")=${ZERO} THEN 'Burn' ELSE 'Transfer' END type,d.value::text value,NULL::text token_id,h.status FROM "TransactionDetail" d JOIN "TransactionHeader" h USING("txId") LEFT JOIN "TokenContract" t ON t."normalizedAddress"=LOWER(d."tokenAddress") AND t."workspaceId"=${workspace} WHERE d."timestamp">=${start} AND (LOWER(d."tokenAddress")=ANY(${kap20}) OR LOWER(d."tokenAddress")=ANY(${kap22})) AND (LOWER(d."fromHash")=${wallet} OR LOWER(d."toHash")=${wallet}) AND ${txFilter} ORDER BY d."timestamp" DESC,d.key DESC OFFSET ${(txPage - 1) * LIMIT} LIMIT ${LIMIT}`),
      prisma.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT 'nft-'||d.key key,d."txId" tx_id,d."timestamp",d."fromHash" from_hash,d."toHash" to_hash,LOWER(d."tokenAddress") token_address,COALESCE(NULLIF(n.name,''),d."tokenName") token_name,d."tokenSymbol" token_symbol,'KAP-721' standard,'Mint' type,'1' value,d."tokenId" token_id,h.status FROM "RedemptionTransactionDetail" d JOIN "RedemptionTransactionHeader" h USING("txId") LEFT JOIN "NFTInstance" n ON n."normalizedTokenAddress"=LOWER(d."tokenAddress") AND n.id=d."tokenId" WHERE d."timestamp">=${start} AND LOWER(d."tokenAddress")=ANY(${kap721}) AND LOWER(d."fromHash")=${ZERO} AND LOWER(d."toHash")=${wallet} AND d."tokenId" IS NOT NULL AND ${redemptionFilter} ORDER BY d."timestamp" DESC,d.key DESC OFFSET ${(redemptionPage - 1) * LIMIT} LIMIT ${LIMIT}`),
    ])
    const tokenTotals = new Map(tokenRows.map((row) => [row.metric, row.total])); const pointTotals = new Map(pointRows.map((row) => [`${row.metric}:${row.token_address}`, row.total])); const nftTotals = new Map(nftRows.map((row) => [row.metric, row.count])); const names = new Map(addresses.map((item) => [item.normalizedAddress.toLowerCase(), item.name])); const byAddress = new Map(tokens.map((token) => [token.normalizedAddress.toLowerCase(), token]))
    const image = (token: typeof tokens[number] | undefined): string | null => token?.imageKey ? `/api/reports/wallet-activity/token-image/${token.id}?workspace=${workspace}` : null
    const order = new Map(['FIT','GRN','INT','TGT'].map((symbol,index)=>[symbol,index])); const points = kap22Tokens.filter((token)=>token.active).sort((a,b)=>(order.get((a.symbol??'').toUpperCase())??100)-(order.get((b.symbol??'').toUpperCase())??100)); const primary = kap20Tokens.find((token)=>token.active); const nftTokens=tokens.filter((token)=>token.active&&token.standard?.toUpperCase()==='KAP-721'); const nft=nftTokens.find((token)=>token.workspaceId===workspace)??nftTokens.find((token)=>token.imageKey)??nftTokens[0]; const nftImage=nft?.imageKey?`/api/reports/wallet-activity/nft-image?workspace=${workspace}&contract=${encodeURIComponent(nft.normalizedAddress)}`:null; const snapshot=snapshots[0]
    const balance = (token: typeof tokens[number] | undefined): string | null => { const field=token?walletBalanceFieldForTokenAddress(token.normalizedAddress):null; return snapshot&&field?snapshot[field].toString():null }
    const expiredBalance = (token: typeof tokens[number]): string | null => { const field=walletExpiredBalanceFieldForTokenAddress(token.normalizedAddress); return snapshot&&field?snapshot[field].toString():null }
    const mapRow=(row:HistoryRow)=>({key:row.key,txId:row.tx_id,timestamp:row.timestamp.toISOString(),fromHash:row.from_hash,toHash:row.to_hash,fromName:names.get(row.from_hash.toLowerCase())??null,toName:names.get(row.to_hash.toLowerCase())??null,tokenAddress:row.token_address,tokenName:row.token_name,tokenSymbol:row.token_symbol,standard:row.standard,type:row.type,value:row.value,tokenId:row.token_id,status:row.status,imageUrl:row.standard==='KAP-721'&&row.token_id?`/api/reports/wallet-activity/nft-image?workspace=${workspace}&contract=${encodeURIComponent(row.token_address)}&tokenId=${encodeURIComponent(row.token_id)}`:image(byAddress.get(row.token_address))})
    return NextResponse.json({wallet:rawWallet,timezone:config.reportingTimezone,historyStart:start.toISOString(),hasWalletSnapshot:Boolean(snapshot),syncedAt:snapshot?.timestamp?.toISOString()??null,kpis:{totalTransactions:String(totalRows[0]?.total??0),monthlyTransactions:monthlyRows.map((row)=>({month:row.month.toISOString().slice(0,7),total:Number(row.total)})),tokenActivity:{received:decimal(tokenTotals.get('received')),burn:decimal(tokenTotals.get('burn')),transfer:decimal(tokenTotals.get('transfer')),name:primary?.name??'KAP-20 Token',symbol:primary?.symbol??'KAP-20',imageUrl:image(primary),chartColor:primary?.chartColor},pointTokenActivity:points.map((token)=>({name:token.name,symbol:token.symbol||token.name,received:decimal(pointTotals.get(`received:${token.normalizedAddress.toLowerCase()}`)),burn:decimal(pointTotals.get(`burn:${token.normalizedAddress.toLowerCase()}`)),transfer:decimal(pointTotals.get(`transfer:${token.normalizedAddress.toLowerCase()}`)),expired:expiredBalance(token),imageUrl:image(token),chartColor:token.chartColor})),nftActivity:{received:String(nftTotals.get('received')??0),burn:String(nftTotals.get('burn')??0),symbol:nft?.symbol??nft?.name??'NFT',imageUrl:nftImage},tokenBalance:{name:primary?.name??'KAP-20 Token',value:balance(primary),symbol:primary?.symbol??'KAP-20',imageUrl:image(primary),chartColor:primary?.chartColor},pointTokenBalance:points.map((token)=>({name:token.name,symbol:token.symbol||token.name,value:balance(token),imageUrl:image(token),chartColor:token.chartColor}))},transactionHistory:{rows:txRows.map(mapRow),total:txTotal,page:txPage,totalPages:txPages},redemptionHistory:{rows:redemptionRows.map(mapRow),total:redemptionTotal,page:redemptionPage,totalPages:redemptionPages}})
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('Wallet activity report error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Failed to load wallet activity report' }, { status: 500 })
  }
}
