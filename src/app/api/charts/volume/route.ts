import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWorkspaceReportScope, parseWorkspaceSelection, tokenScopeFilter, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'

interface MonthlyVolume { mint: number; transfer: number; total: number }

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessMenu(admin, 'analytics') && !canAccessMenu(admin, 'overview')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const selection = parseWorkspaceSelection(new URL(req.url).searchParams.get('workspace'))
    if (selection === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
    if (!canAccessWorkspace(admin, selection)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const scope = await getWorkspaceReportScope(selection)
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const details = await prisma.transactionDetail.findMany({
      select: { txId: true, timestamp: true, txType: true },
      where: { timestamp: { gte: twelveMonthsAgo }, ...tokenScopeFilter(scope.tokenAddresses) },
      orderBy: { timestamp: 'asc' },
    })
    const transactionKinds = new Map<string, { timestamp: Date; mint: boolean }>()
    for (const detail of details) {
      const current = transactionKinds.get(detail.txId)
      transactionKinds.set(detail.txId, {
        timestamp: current && current.timestamp < detail.timestamp ? current.timestamp : detail.timestamp,
        mint: Boolean(current?.mint || detail.txType === 'token_minting'),
      })
    }
    const monthMap = new Map<string, MonthlyVolume>()
    for (const transaction of transactionKinds.values()) {
      const date = new Date(transaction.timestamp)
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`
      const entry = monthMap.get(key) ?? { mint: 0, transfer: 0, total: 0 }
      if (transaction.mint) entry.mint += 1
      else entry.transfer += 1
      entry.total += 1
      monthMap.set(key, entry)
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const volume = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([key, value]) => {
      const [year, monthIndex] = key.split('-').map(Number)
      return { label: `${months[monthIndex]} ${year}`, ...value }
    })
    return NextResponse.json({ volume })
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('Volume chart error:', error)
    return NextResponse.json({ error: 'Failed to fetch volume data' }, { status: 500 })
  }
}
