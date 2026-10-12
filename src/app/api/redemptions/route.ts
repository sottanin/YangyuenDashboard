import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import type { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'redemptions')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20))
  const tokenName = searchParams.get('tokenName') || undefined
  const workspace = parseWorkspaceSelection(searchParams.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })

  const skip = (page - 1) * limit

  try {
    const scope = await getWorkspaceReportScope(workspace)
    const where: Prisma.RedemptionTransactionDetailWhereInput = {
      ...(tokenName ? { tokenName } : {}),
      ...(scope.tokenAddresses === null ? {} : { tokenAddress: { in: scope.tokenAddresses, mode: 'insensitive' } }),
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
