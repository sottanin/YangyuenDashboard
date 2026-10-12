import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, parseWorkspaceSelection, tokenScopeFilter } from '@/lib/reporting/workspaceScope'

export async function GET(req: NextRequest) {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessMenu(admin, 'analytics')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const selection = parseWorkspaceSelection(new URL(req.url).searchParams.get('workspace'))
    if (selection === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
    if (!canAccessWorkspace(admin, selection)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const scope = await getWorkspaceReportScope(selection)

    const transactions = await prisma.transactionDetail.findMany({
      select: { timestamp: true },
      where: { timestamp: { gte: sevenDaysAgo }, ...tokenScopeFilter(scope.tokenAddresses) },
    })

    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const tx of transactions) {
      const d = new Date(tx.timestamp)
      const day = (d.getDay() + 6) % 7
      const hour = d.getHours()
      grid[day][hour]++
    }

    const maxVal = Math.max(...grid.flat(), 1)
    const normalized = grid.map((row) => row.map((v) => Math.round((v / maxVal) * 100)))

    return NextResponse.json({ heatmap: normalized })
  } catch (error) {
    console.error('Heatmap error:', error)
    return NextResponse.json({ error: 'Failed to fetch heatmap data' }, { status: 500 })
  }
}
