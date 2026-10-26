import { parseReportDateRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'
import { NextRequest, NextResponse } from 'next/server'
import { getKap22TopUsers } from '@/lib/reporting/kap22Analysis'
import { isValidAddress, normalizeAddress } from '@/lib/system/addresses'
import { parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET(request: NextRequest) {
  try {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap22-analysis') || !canAccessAnyChart(admin, ['kap22.top-recipients', 'kap22.top-holders'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const token = request.nextUrl.searchParams.get('token')?.trim() ?? ''
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (!isValidAddress(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })

  try {
    const range = await parseReportDateRange(request.nextUrl.searchParams)
    const result = await getKap22TopUsers(normalizeAddress(token), workspace, range)
    if (!result) return NextResponse.json({ error: 'Token is not active in the selected scope' }, { status: 400 })
    return NextResponse.json({ ...result, topReceived: canAccessChart(admin, 'kap22.top-recipients') ? result.topReceived : [], topBalances: canAccessChart(admin, 'kap22.top-holders') ? result.topBalances : [] })
  } catch (error) {
    if (error instanceof ReportPeriodError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('KAP-22 top users error:', error)
    return NextResponse.json({ error: 'Failed to load KAP-22 top users' }, { status: 500 })
  }
  } catch (error) { if (error instanceof ReportPeriodError) return NextResponse.json({ error: error.message }, { status: 400 }); console.error('Token report error:', error instanceof Error ? error.message : 'unknown'); return NextResponse.json({ error: 'Unable to load token report' }, { status: 500 }) }
}
