import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceParam = searchParams.get('workspace')

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Build optional token address filter for workspace
    let tokenAddresses: string[] | null = null
    if (workspaceParam && workspaceParam !== 'all') {
      const wsId = parseInt(workspaceParam)
      if (!isNaN(wsId)) {
        const systemWs = await prisma.workspace.findUnique({ where: { name: 'SYSTEM' } })
        const contracts = await prisma.tokenContract.findMany({
          where: {
            OR: [
              { workspaceId: wsId },
              ...(systemWs ? [{ workspaceId: systemWs.id }] : []),
            ],
          },
          select: { address: true },
        })
        tokenAddresses = contracts.map((c) => c.address)
      }
    }

    const txDetailWhere = tokenAddresses ? { tokenAddress: { in: tokenAddresses } } : {}
    const rTxDetailWhere = tokenAddresses ? { tokenAddress: { in: tokenAddresses } } : {}

    const [
      totalTx,
      totalRedemptions,
      totalWallets,
      txFeeAgg,
      rTxFeeAgg,
      txDailyFeeAgg,
      rTxDailyFeeAgg,
    ] = await Promise.all([
      prisma.transactionDetail.count({ where: txDetailWhere }),
      prisma.redemptionTransactionDetail.count({ where: rTxDetailWhere }),
      prisma.wallet.count(),
      prisma.transactionHeader.aggregate({ _sum: { fee: true } }),
      prisma.redemptionTransactionHeader.aggregate({ _sum: { fee: true } }),
      prisma.transactionHeader.aggregate({ _sum: { fee: true }, where: { timestamp: { gte: todayStart } } }),
      prisma.redemptionTransactionHeader.aggregate({ _sum: { fee: true }, where: { timestamp: { gte: todayStart } } }),
    ])

    const totalGasFee =
      Number(txFeeAgg._sum.fee ?? 0) + Number(rTxFeeAgg._sum.fee ?? 0)
    const dailyGasFee =
      Number(txDailyFeeAgg._sum.fee ?? 0) + Number(rTxDailyFeeAgg._sum.fee ?? 0)

    return NextResponse.json({
      totalTransactions: totalTx + totalRedemptions,
      totalRedemptions,
      totalWallets,
      totalGasFee: totalGasFee.toFixed(3),
      dailyGasFee: dailyGasFee.toFixed(3),
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
