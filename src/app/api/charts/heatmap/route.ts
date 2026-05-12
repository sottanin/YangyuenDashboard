import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceParam = searchParams.get('workspace')

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    let tokenAddressFilter: { tokenAddress: { in: string[] } } | undefined
    if (workspaceParam && workspaceParam !== 'all') {
      const wsId = parseInt(workspaceParam)
      if (!isNaN(wsId)) {
        const systemWs = await prisma.workspace.findUnique({ where: { name: 'SYSTEM' } })
        const contracts = await prisma.tokenContract.findMany({
          where: {
            OR: [
              { workspaceId: wsId },
              ...(systemWs ? [{ workspaceId: systemWs.id }] : []),
            ],
          },
          select: { address: true },
        })
        tokenAddressFilter = { tokenAddress: { in: contracts.map((c) => c.address) } }
      }
    }

    const transactions = await prisma.transactionDetail.findMany({
      select: { timestamp: true },
      where: { timestamp: { gte: sevenDaysAgo }, ...tokenAddressFilter },
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
