import { NextRequest, NextResponse } from 'next/server'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getKap20Summary } from '@/lib/reporting/kap20Analysis'
import { parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

const SUMMARY_CHARTS = ['kap20.mint', 'kap20.backup-wallet', 'kap20.workspace-wallet', 'kap20.distributor-pool', 'kap20.user-wallet', 'kap20.redemption-burn', 'kap20.redemption-fee', 'kap20.daily-transaction-count', 'kap20.daily-transfer-volume', 'kap20.activity-heatmap', 'kap20.conversion-balance'] as const
const RECONCILIATION_CHARTS = ['kap20.mint', 'kap20.backup-wallet', 'kap20.workspace-wallet', 'kap20.distributor-pool', 'kap20.user-wallet', 'kap20.redemption-burn', 'kap20.redemption-fee'] as const
export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap20-analysis') || !canAccessAnyChart(admin, SUMMARY_CHARTS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace')); const token = request.nextUrl.searchParams.get('token')
  if (workspace === null || !token) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const data = await getKap20Summary(token, workspace)
  if (!data) return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  const showDaily = canAccessAnyChart(admin, ['kap20.daily-transaction-count', 'kap20.daily-transfer-volume', 'kap20.activity-heatmap'])
  const showReconciliation = RECONCILIATION_CHARTS.every((chart) => canAccessChart(admin, chart))
  return NextResponse.json({ ...data,
    mint: canAccessChart(admin, 'kap20.mint') ? data.mint : '0', backupWallet: canAccessChart(admin, 'kap20.backup-wallet') ? data.backupWallet : '0', workspaceWallet: canAccessChart(admin, 'kap20.workspace-wallet') ? data.workspaceWallet : '0', distributorPool: canAccessChart(admin, 'kap20.distributor-pool') ? data.distributorPool : '0', userWallet: canAccessChart(admin, 'kap20.user-wallet') ? data.userWallet : '0', redemptionBurn: canAccessChart(admin, 'kap20.redemption-burn') ? data.redemptionBurn : '0', redemptionFee: canAccessChart(admin, 'kap20.redemption-fee') ? data.redemptionFee : '0',
    daily: showDaily ? data.daily.map((point) => ({ ...point, totalTransactions: canAccessChart(admin, 'kap20.daily-transaction-count') ? point.totalTransactions : 0, totalAmount: canAccessChart(admin, 'kap20.daily-transfer-volume') ? point.totalAmount : '0' })) : [],
    pointTokenLocks: canAccessChart(admin, 'kap20.conversion-balance') ? data.pointTokenLocks : [],
    reconciliationDelta: showReconciliation ? data.reconciliationDelta : '0',
    reconciliationMatched: showReconciliation ? data.reconciliationMatched : true,
  })
}
