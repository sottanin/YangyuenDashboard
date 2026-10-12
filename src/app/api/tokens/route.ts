import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessMenu(admin, 'tokens') && !canAccessMenu(admin, 'overview')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
    if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
    if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const scope = await getWorkspaceReportScope(workspace)
    const tokenAddressFilter = scope.tokenAddresses === null ? undefined : { in: scope.tokenAddresses, mode: 'insensitive' as const }
    const [tokenContracts, tokenCounts, nftInstances] = await Promise.all([
      prisma.tokenContract.findMany({ where: workspace === 'all' ? undefined : { workspaceId: workspace } }),
      prisma.transactionDetail.groupBy({
        by: ['tokenName'],
        where: tokenAddressFilter ? { tokenAddress: tokenAddressFilter } : undefined,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.nFTInstance.findMany({
        where: { visible: true, ...(tokenAddressFilter ? { tokenAddress: tokenAddressFilter } : {}) },
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
