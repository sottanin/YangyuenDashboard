import { NextRequest, NextResponse } from 'next/server'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getNftRedemptionsSummary, getNftRedemptionInsights, InvalidReportTokenError } from '@/lib/reporting/nftRedemptionsAnalysis'
import { parseReportDateRange, getPreviousReportRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'redemptions') || !canAccessAnyChart(admin, ['nft.nft-mint', 'nft.nft-burn', 'nft.kap20-burn', 'nft.kap20-fee'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!await isSelectableReportWorkspace(workspace)) return NextResponse.json({ error: 'Select one workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    const token = request.nextUrl.searchParams.get('token') ?? ''
    const range = await parseReportDateRange(request.nextUrl.searchParams)
    const previousRange = await getPreviousReportRange(range)
    const [summary, insights, previous] = await Promise.all([getNftRedemptionsSummary(workspace, token, range), getNftRedemptionInsights(workspace, token, range), previousRange ? getNftRedemptionsSummary(workspace, token, previousRange) : Promise.resolve(null)])
    const mint = canAccessChart(admin, 'nft.nft-mint'); const burn = canAccessChart(admin, 'nft.nft-burn')
    const payment = canAccessChart(admin, 'nft.kap20-burn'); const fee = canAccessChart(admin, 'nft.kap20-fee')
    const canViewNftMetadata = canAccessAnyChart(admin, ['nft.nft-mint', 'nft.nft-burn'])
    const canViewKap20Metadata = canAccessAnyChart(admin, ['nft.kap20-burn', 'nft.kap20-fee'])
    return NextResponse.json({ ...summary,
      period: { from: range.from, to: range.to },
      comparisonPeriod: previousRange ? { from: previousRange.from, to: previousRange.to } : null,
      previous: previous ? { nftMint: mint ? previous.nftMint : null, nftBurn: burn ? previous.nftBurn : null, kap20Burn: payment ? previous.kap20Burn : null, kap20Fee: fee ? previous.kap20Fee : null } : null,
      trend: mint || burn ? insights.trend.map((point) => ({ label: point.label, ...(mint ? { issued: point.issued } : {}), ...(burn ? { used: point.used } : {}) })) : [],
      currentInventory: mint && burn ? insights.currentInventory : null,
      dataThrough: mint || burn ? insights.dataThrough : null,
      nftMint: canAccessChart(admin, 'nft.nft-mint') ? summary.nftMint : 0,
      nftBurn: canAccessChart(admin, 'nft.nft-burn') ? summary.nftBurn : 0,
      nftSymbol: canViewNftMetadata ? summary.nftSymbol : 'NFT',
      nftImageUrl: canViewNftMetadata ? summary.nftImageUrl : null,
      kap20Burn: canAccessChart(admin, 'nft.kap20-burn') ? summary.kap20Burn : '0',
      kap20Fee: canAccessChart(admin, 'nft.kap20-fee') ? summary.kap20Fee : '0',
      kap20Symbol: canViewKap20Metadata ? summary.kap20Symbol : 'KAP-20',
      kap20ImageUrl: canViewKap20Metadata ? summary.kap20ImageUrl : null,
    })
  } catch (error) {
    if (error instanceof ReportPeriodError || error instanceof InvalidReportTokenError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('NFT redemption summary error:', error)
    return NextResponse.json({ error: 'Unable to load NFT redemption summary' }, { status: 500 })
  }
}
