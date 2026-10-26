import { compareReportValues, getPreviousReportRange, parseReportDateRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getKap20Summary } from '@/lib/reporting/kap20Analysis'
import { parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

const SUMMARY_CHARTS = ['kap20.mint', 'kap20.backup-wallet', 'kap20.workspace-wallet', 'kap20.distributor-pool', 'kap20.user-wallet', 'kap20.redemption-burn', 'kap20.redemption-fee', 'kap20.daily-transaction-count', 'kap20.daily-transfer-volume', 'kap20.activity-heatmap', 'kap20.conversion-balance'] as const
const RECONCILIATION_CHARTS = ['kap20.mint', 'kap20.backup-wallet', 'kap20.workspace-wallet', 'kap20.distributor-pool', 'kap20.user-wallet', 'kap20.redemption-burn', 'kap20.redemption-fee'] as const
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap20-analysis') || !canAccessAnyChart(admin, SUMMARY_CHARTS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace')); const token = request.nextUrl.searchParams.get('token')
  if (workspace === null || !token) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const range = await parseReportDateRange(request.nextUrl.searchParams)
    const data = await getKap20Summary(token, workspace, range)
  if (!data) return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  const previousRange = await getPreviousReportRange(range)
  const previous = previousRange ? await getKap20Summary(token, workspace, previousRange) : null
  const activityComparison = { mint: canAccessChart(admin, 'kap20.mint') ? compareReportValues(data.activity.mint, previous?.activity.mint ?? null) : null, redemptionBurn: canAccessChart(admin, 'kap20.redemption-burn') ? compareReportValues(data.activity.redemptionBurn, previous?.activity.redemptionBurn ?? null) : null, redemptionFee: canAccessChart(admin, 'kap20.redemption-fee') ? compareReportValues(data.activity.redemptionFee, previous?.activity.redemptionFee ?? null) : null }
  const showDaily = canAccessAnyChart(admin, ['kap20.daily-transaction-count', 'kap20.daily-transfer-volume', 'kap20.activity-heatmap'])
  const showReconciliation = RECONCILIATION_CHARTS.every((chart) => canAccessChart(admin, chart))
  return NextResponse.json({ ...data, activityComparison, comparison: previousRange ? {from:previousRange.from,to:previousRange.to} : null, activity: { mint: canAccessChart(admin, 'kap20.mint') ? data.activity.mint : '0', redemptionBurn: canAccessChart(admin, 'kap20.redemption-burn') ? data.activity.redemptionBurn : '0', redemptionFee: canAccessChart(admin, 'kap20.redemption-fee') ? data.activity.redemptionFee : '0' },
    mint: canAccessChart(admin, 'kap20.mint') ? data.mint : '0', backupWallet: canAccessChart(admin, 'kap20.backup-wallet') ? data.backupWallet : '0', workspaceWallet: canAccessChart(admin, 'kap20.workspace-wallet') ? data.workspaceWallet : '0', distributorPool: canAccessChart(admin, 'kap20.distributor-pool') ? data.distributorPool : '0', userWallet: canAccessChart(admin, 'kap20.user-wallet') ? data.userWallet : '0', redemptionBurn: canAccessChart(admin, 'kap20.redemption-burn') ? data.redemptionBurn : '0', redemptionFee: canAccessChart(admin, 'kap20.redemption-fee') ? data.redemptionFee : '0',
    daily: showDaily ? data.daily.map((point) => ({ ...point, totalTransactions: canAccessChart(admin, 'kap20.daily-transaction-count') ? point.totalTransactions : 0, totalAmount: canAccessChart(admin, 'kap20.daily-transfer-volume') ? point.totalAmount : '0' })) : [],
    pointTokenLocks: canAccessChart(admin, 'kap20.conversion-balance') ? data.pointTokenLocks : [],
    reconciliationDelta: showReconciliation ? data.reconciliationDelta : '0',
    reconciliationMatched: showReconciliation ? data.reconciliationMatched : true,
  })
  } catch (error) { if (error instanceof ReportPeriodError) return NextResponse.json({ error: error.message }, { status: 400 }); console.error('Token report error:', error instanceof Error ? error.message : 'unknown'); return NextResponse.json({ error: 'Unable to load token report' }, { status: 500 }) }
}
