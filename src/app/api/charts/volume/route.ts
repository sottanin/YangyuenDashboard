import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workspaceParam = searchParams.get('workspace')

    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    // Build optional token address filter
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
      select: { timestamp: true, txType: true, value: true },
      where: { timestamp: { gte: twelveMonthsAgo }, ...tokenAddressFilter },
      orderBy: { timestamp: 'asc' },
    })

    const monthMap = new Map<string, { mint: number; transfer: number; total: number }>()
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    for (const tx of transactions) {
      const d = new Date(tx.timestamp)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!monthMap.has(key)) monthMap.set(key, { mint: 0, transfer: 0, total: 0 })
      const entry = monthMap.get(key)!
      if (tx.txType === 'token_minting') entry.mint++
      else entry.transfer++
      entry.total++
    }

    const sorted = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, val]) => {
        const [year, monthIdx] = key.split('-').map(Number)
        return { label: `${months[monthIdx]} ${year}`, mint: val.mint, transfer: val.transfer, total: val.total }
      })

    return NextResponse.json({ volume: sorted })
  } catch (error) {
    console.error('Volume chart error:', error)
    return NextResponse.json({ error: 'Failed to fetch volume data' }, { status: 500 })
  }
}
