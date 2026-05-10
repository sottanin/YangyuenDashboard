import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [totalTx, totalRedemptions, totalWallets, uniqueWallets] = await Promise.all([
      prisma.transactionDetail.count(),
      prisma.redemptionTransactionDetail.count(),
      prisma.wallet.count(),
      prisma.transactionDetail.findMany({
        select: { fromHash: true },
        distinct: ['fromHash'],
      }),
    ])

    return NextResponse.json({
      totalTransactions: totalTx,
      totalRedemptions,
      totalWallets,
      activeWallets: uniqueWallets.length,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
