import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const skip = (page - 1) * limit

  try {
    const [wallets, total] = await Promise.all([
      prisma.wallet.findMany({
        orderBy: { balanceICC: 'desc' },
        skip,
        take: limit,
      }),
      prisma.wallet.count(),
    ])

    return NextResponse.json({
      wallets: wallets.map((w) => ({
        ...w,
        balanceICC: w.balanceICC.toString(),
        balanceGreen: w.balanceGreen.toString(),
        balanceTogether: w.balanceTogether.toString(),
        balanceIntegrity: w.balanceIntegrity.toString(),
        balanceFit: w.balanceFit.toString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Wallets error:', error)
    return NextResponse.json({ error: 'Failed to fetch wallets' }, { status: 500 })
  }
}
