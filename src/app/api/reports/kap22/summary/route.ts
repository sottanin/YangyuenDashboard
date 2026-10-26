import { compareReportValues, getPreviousReportRange, parseReportDateRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'
import { NextRequest, NextResponse } from 'next/server'
import { getKap22Summary } from '@/lib/reporting/kap22Analysis'
import { normalizeAddress, isValidAddress } from '@/lib/system/addresses'
import { parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET(request: NextRequest) {
  try {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap22-analysis') || !canAccessAnyChart(admin, ['kap22.mint', 'kap22.distributor-pool', 'kap22.operation-pool', 'kap22.user-wallet', 'kap22.burn-wallet', 'kap22.expired', 'kap22.daily-transaction-count', 'kap22.daily-transfer-volume', 'kap22.activity-heatmap'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const token = request.nextUrl.searchParams.get('token')?.trim() ?? ''
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (!isValidAddress(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    const canViewExpired = canAccessChart(admin, 'kap22.expired')
    const range = await parseReportDateRange(request.nextUrl.searchParams)
    const summary = await getKap22Summary(normalizeAddress(token), workspace, { includeExpired: canViewExpired, range })
    if (!summary) return NextResponse.json({ error: 'Token is not active in the selected scope' }, { status: 400 })
    const previousRange = await getPreviousReportRange(range)
    const previous = previousRange ? await getKap22Summary(normalizeAddress(token), workspace, { range: previousRange }) : null
    const activityComparison = { mint: canAccessChart(admin, 'kap22.mint') ? compareReportValues(summary.activity?.mint ?? '0', previous?.activity?.mint ?? null) : null, burn: canAccessChart(admin, 'kap22.burn-wallet') ? compareReportValues(summary.activity?.burn ?? '0', previous?.activity?.burn ?? null) : null, distributed: canAccessChart(admin, 'kap22.user-wallet') ? compareReportValues(summary.activity?.distributed ?? '0', previous?.activity?.distributed ?? null) : null, totalTransactions: canAccessChart(admin, 'kap22.daily-transaction-count') ? compareReportValues(String(summary.activity?.totalTransactions ?? 0), previous?.activity ? String(previous.activity.totalTransactions) : null) : null }
    const showDaily = canAccessAnyChart(admin, ['kap22.daily-transaction-count', 'kap22.daily-transfer-volume', 'kap22.activity-heatmap'])
    return NextResponse.json({ ...summary, activityComparison, comparison: previousRange ? {from:previousRange.from,to:previousRange.to} : null, activity: { mint: canAccessChart(admin, 'kap22.mint') ? summary.activity?.mint : '0', burn: canAccessChart(admin, 'kap22.burn-wallet') ? summary.activity?.burn : '0', distributed: canAccessChart(admin, 'kap22.user-wallet') ? summary.activity?.distributed : '0', totalTransactions: canAccessChart(admin, 'kap22.daily-transaction-count') ? summary.activity?.totalTransactions : 0 },
      totalTransactions: canAccessChart(admin, 'kap22.daily-transaction-count') ? summary.totalTransactions : 0,
      distributorPool: canAccessChart(admin, 'kap22.distributor-pool') ? summary.distributorPool : '0', operationPool: canAccessChart(admin, 'kap22.operation-pool') ? summary.operationPool : '0', mint: canAccessChart(admin, 'kap22.mint') ? summary.mint : '0', transferToUsers: canAccessChart(admin, 'kap22.user-wallet') ? summary.transferToUsers : '0', burn: canAccessChart(admin, 'kap22.burn-wallet') ? summary.burn : '0', expired: canViewExpired ? summary.expired : '0', reconciliationDelta: '0', reconciliationMatched: true,
      daily: showDaily ? summary.daily.map((point) => ({ ...point, totalTransactions: canAccessChart(admin, 'kap22.daily-transaction-count') ? point.totalTransactions : 0, totalAmount: canAccessChart(admin, 'kap22.daily-transfer-volume') ? point.totalAmount : '0' })) : [],
    })
  } catch (error) {
    if (error instanceof ReportPeriodError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('KAP-22 summary error:', error)
    return NextResponse.json({ error: 'Failed to load KAP-22 summary' }, { status: 500 })
  }
  } catch (error) { if (error instanceof ReportPeriodError) return NextResponse.json({ error: error.message }, { status: 400 }); console.error('Token report error:', error instanceof Error ? error.message : 'unknown'); return NextResponse.json({ error: 'Unable to load token report' }, { status: 500 }) }
}
