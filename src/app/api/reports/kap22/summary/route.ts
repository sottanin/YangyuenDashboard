import { NextRequest, NextResponse } from 'next/server'
import { getKap22Summary } from '@/lib/reporting/kap22Analysis'
import { normalizeAddress, isValidAddress } from '@/lib/system/addresses'
import { parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap22-analysis') || !canAccessAnyChart(admin, ['kap22.mint', 'kap22.distributor-pool', 'kap22.operation-pool', 'kap22.user-wallet', 'kap22.burn-wallet', 'kap22.daily-transaction-count', 'kap22.daily-transfer-volume', 'kap22.activity-heatmap'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const token = request.nextUrl.searchParams.get('token')?.trim() ?? ''
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (!isValidAddress(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    const summary = await getKap22Summary(normalizeAddress(token), workspace)
    if (!summary) return NextResponse.json({ error: 'Token is not active in the selected scope' }, { status: 400 })
    const showDaily = canAccessAnyChart(admin, ['kap22.daily-transaction-count', 'kap22.daily-transfer-volume', 'kap22.activity-heatmap'])
    return NextResponse.json({ ...summary,
      distributorPool: canAccessChart(admin, 'kap22.distributor-pool') ? summary.distributorPool : '0', operationPool: canAccessChart(admin, 'kap22.operation-pool') ? summary.operationPool : '0', mint: canAccessChart(admin, 'kap22.mint') ? summary.mint : '0', transferToUsers: canAccessChart(admin, 'kap22.user-wallet') ? summary.transferToUsers : '0', burn: canAccessChart(admin, 'kap22.burn-wallet') ? summary.burn : '0', reconciliationDelta: '0', reconciliationMatched: true,
      daily: showDaily ? summary.daily.map((point) => ({ ...point, totalTransactions: canAccessChart(admin, 'kap22.daily-transaction-count') ? point.totalTransactions : 0, totalAmount: canAccessChart(admin, 'kap22.daily-transfer-volume') ? point.totalAmount : '0' })) : [],
    })
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('KAP-22 summary error:', error)
    return NextResponse.json({ error: 'Failed to load KAP-22 summary' }, { status: 500 })
  }
}
