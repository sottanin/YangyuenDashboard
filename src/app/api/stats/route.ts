import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWorkspaceReportScope, parseWorkspaceSelection, tokenScopeFilter, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { startOfDayInTimeZone } from '@/lib/reporting/timezone'
import { getReportingConfig } from '@/lib/system/config'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['overview', 'analytics', 'transactions', 'redemptions'].some((key) => canAccessMenu(admin, key))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const selection = parseWorkspaceSelection(new URL(req.url).searchParams.get('workspace'))
    if (selection === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
    if (!canAccessWorkspace(admin, selection)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const scope = await getWorkspaceReportScope(selection)
    const detailFilter = tokenScopeFilter(scope.tokenAddresses)
    const config = await getReportingConfig()
    const todayStart = startOfDayInTimeZone(new Date(), config.reportingTimezone)

    const txWhere = scope.tokenAddresses === null ? {} : { details: { some: detailFilter } }
    const redemptionWhere = scope.tokenAddresses === null ? {} : { details: { some: detailFilter } }
    const [totalTransactions, totalRedemptions, totalWallets] = await Promise.all([
      prisma.transactionHeader.count({ where: txWhere }),
      prisma.redemptionTransactionHeader.count({ where: redemptionWhere }),
      prisma.wallet.count(),
    ])
    const [txFee, redemptionFee, dailyTxFee, dailyRedemptionFee] = await Promise.all([
      prisma.transactionHeader.aggregate({ where: txWhere, _sum: { fee: true } }),
      prisma.redemptionTransactionHeader.aggregate({ where: redemptionWhere, _sum: { fee: true } }),
      prisma.transactionHeader.aggregate({ where: { ...txWhere, timestamp: { gte: todayStart } }, _sum: { fee: true } }),
      prisma.redemptionTransactionHeader.aggregate({ where: { ...redemptionWhere, timestamp: { gte: todayStart } }, _sum: { fee: true } }),
    ])
    const totalGasFee = Number(txFee._sum.fee ?? 0) + Number(redemptionFee._sum.fee ?? 0)
    const dailyGasFee = Number(dailyTxFee._sum.fee ?? 0) + Number(dailyRedemptionFee._sum.fee ?? 0)
    return NextResponse.json({
      totalTransactions: totalTransactions + totalRedemptions,
      totalRedemptions,
      totalWallets,
      totalGasFee: totalGasFee.toFixed(3),
      dailyGasFee: dailyGasFee.toFixed(3),
    })
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('Stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
