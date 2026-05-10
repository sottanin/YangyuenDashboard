import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const tokenName = searchParams.get('tokenName') || undefined

  const skip = (page - 1) * limit

  try {
    const where = {
      ...(tokenName ? { tokenName } : {}),
    }

    const [redemptions, total] = await Promise.all([
      prisma.redemptionTransactionDetail.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          txId: true,
          fromHash: true,
          toHash: true,
          tokenName: true,
          tokenSymbol: true,
          tokenType: true,
          tokenId: true,
          timestamp: true,
          method: true,
          header: {
            select: { fee: true, value: true, status: true },
          },
        },
      }),
      prisma.redemptionTransactionDetail.count({ where }),
    ])

    return NextResponse.json({
      redemptions: redemptions.map((r) => ({
        id: r.id,
        txId: r.txId,
        fromHash: r.fromHash,
        toHash: r.toHash,
        tokenName: r.tokenName,
        tokenSymbol: r.tokenSymbol,
        tokenType: r.tokenType,
        tokenId: r.tokenId ?? null,
        fee: r.header?.fee?.toString() ?? '0',
        value: r.header?.value?.toString() ?? '0',
        timestamp: r.timestamp,
        status: r.header?.status ?? null,
        method: r.method,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Redemptions error:', error)
    return NextResponse.json({ error: 'Failed to fetch redemptions' }, { status: 500 })
  }
}
