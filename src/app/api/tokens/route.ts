import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [tokenContracts, tokenCounts, nftInstances] = await Promise.all([
      prisma.tokenContract.findMany(),
      prisma.transactionDetail.groupBy({
        by: ['tokenName'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.nFTInstance.findMany({
        where: { visible: true },
        take: 50,
        orderBy: { id: 'asc' },
      }),
    ])

    return NextResponse.json({
      tokens: tokenContracts.map((tc) => ({
        ...tc,
        transferCount: tokenCounts.find((c) => c.tokenName === tc.name)?._count.id || 0,
      })),
      nftInstances,
    })
  } catch (error) {
    console.error('Tokens error:', error)
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
  }
}
