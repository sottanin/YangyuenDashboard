import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '20', 10))
  const status = searchParams.get('status') || undefined

  const [logs, total] = await Promise.all([
    prisma.batchJobLog.findMany({
      where: status ? { status } : undefined,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.batchJobLog.count({ where: status ? { status } : undefined }),
  ])

  return NextResponse.json({ logs, total, page, limit })
}
