import { NextRequest, NextResponse } from 'next/server'
import { canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getNftRedemptionTransactions, InvalidReportTokenError } from '@/lib/reporting/nftRedemptionsAnalysis'
import { parseReportDateRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'redemptions') || !canAccessChart(admin, 'nft.transaction-history')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const params = request.nextUrl.searchParams
  const workspace = parseWorkspaceSelection(params.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!await isSelectableReportWorkspace(workspace)) return NextResponse.json({ error: 'Select one workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1))
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get('limit') ?? '20', 10) || 20))
  const search = (params.get('search') ?? '').trim().slice(0, 128)
  try {
    const token = params.get('token') ?? ''
    const data = await getNftRedemptionTransactions(workspace, page, limit, search, token, await parseReportDateRange(params))
    return NextResponse.json({ ...data, page, limit })
  } catch (error) {
    if (error instanceof ReportPeriodError || error instanceof InvalidReportTokenError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('NFT redemption transactions error:', error)
    return NextResponse.json({ error: 'Unable to load NFT redemption transactions' }, { status: 500 })
  }
}
