import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import type { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'transactions')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20))
  const tokenName = searchParams.get('tokenName') || undefined
  const txType = searchParams.get('txType') || undefined
  const workspace = parseWorkspaceSelection(searchParams.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })

  const skip = (page - 1) * limit

  try {
    const scope = await getWorkspaceReportScope(workspace)
    const where: Prisma.TransactionDetailWhereInput = {
      ...(tokenName ? { tokenName } : {}),
      ...(txType ? { txType } : {}),
      ...(scope.tokenAddresses === null ? {} : { tokenAddress: { in: scope.tokenAddresses, mode: 'insensitive' } }),
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
