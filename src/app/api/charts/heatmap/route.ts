import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const transactions = await prisma.transactionDetail.findMany({
      select: { timestamp: true },
      where: { timestamp: { gte: sevenDaysAgo } },
    })

    // 7 rows (Mon–Sun) × 24 cols (hours)
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))

    for (const tx of transactions) {
      const d = new Date(tx.timestamp)
      const day = (d.getDay() + 6) % 7 // 0=Mon, 6=Sun
      const hour = d.getHours()
      grid[day][hour]++
    }

    // Normalize to 0–100
    const maxVal = Math.max(...grid.flat(), 1)
    const normalized = grid.map((row) => row.map((v) => Math.round((v / maxVal) * 100)))

    return NextResponse.json({ heatmap: normalized })
  } catch (error) {
    console.error('Heatmap error:', error)
    return NextResponse.json({ error: 'Failed to fetch heatmap data' }, { status: 500 })
  }
}
