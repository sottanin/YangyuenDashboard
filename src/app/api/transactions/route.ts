import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const tokenName = searchParams.get('tokenName') || undefined
  const txType = searchParams.get('txType') || undefined

  const skip = (page - 1) * limit

  try {
    const where = {
      ...(tokenName ? { tokenName } : {}),
      ...(txType ? { txType } : {}),
    }

    const [transactions, total] = await Promise.all([
      prisma.transactionDetail.findMany({
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
          value: true,
          timestamp: true,
          txType: true,
          method: true,
          header: {
            select: { fee: true, status: true },
          },
        },
      }),
      prisma.transactionDetail.count({ where }),
    ])

    return NextResponse.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        txId: t.txId,
        fromHash: t.fromHash,
        toHash: t.toHash,
        tokenName: t.tokenName,
        tokenSymbol: t.tokenSymbol,
        value: t.value.toString(),
        fee: t.header?.fee?.toString() ?? '0',
        timestamp: t.timestamp,
        status: t.header?.status ?? null,
        txType: t.txType,
        method: t.method,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Transactions error:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}
