import { NextRequest, NextResponse } from 'next/server'
import { canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getTopNftBurns, InvalidReportTokenError } from '@/lib/reporting/nftRedemptionsAnalysis'
import { parseReportDateRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'redemptions') || !canAccessChart(admin, 'nft.top-burns')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!await isSelectableReportWorkspace(workspace)) return NextResponse.json({ error: 'Select one workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    const token = request.nextUrl.searchParams.get('token') ?? ''
    return NextResponse.json({ rows: await getTopNftBurns(workspace, token, await parseReportDateRange(request.nextUrl.searchParams)) })
  } catch (error) {
    if (error instanceof ReportPeriodError || error instanceof InvalidReportTokenError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Top NFT burns error:', error)
    return NextResponse.json({ error: 'Unable to load NFT burn rankings' }, { status: 500 })
  }
}
