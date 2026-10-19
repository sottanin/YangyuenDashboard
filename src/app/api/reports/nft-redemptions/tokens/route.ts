import { NextRequest, NextResponse } from 'next/server'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { listNftReportTokens } from '@/lib/reporting/nftRedemptionsAnalysis'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import { getReportDateBounds } from '@/lib/reporting/reportPeriod'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'redemptions')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (workspace === null || !await isSelectableReportWorkspace(workspace)) return NextResponse.json({ error: 'Select one workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const [tokens, bounds] = await Promise.all([listNftReportTokens(workspace), getReportDateBounds()])
  return NextResponse.json({ tokens, ...bounds })
}
