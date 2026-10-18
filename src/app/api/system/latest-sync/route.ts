import { NextResponse } from 'next/server'
import { getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'

export async function GET(): Promise<NextResponse> {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const latest = await prisma.batchJobLog.findFirst({
      where: {
        status: 'completed',
        finishedAt: { not: null },
        tokenName: { in: ['ManualBatchPipeline', 'ScheduledBatchPipeline'] },
      },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    })

    return NextResponse.json({ finishedAt: latest?.finishedAt?.toISOString() ?? null })
  } catch {
    return NextResponse.json({ error: 'Unable to load sync status' }, { status: 500 })
  }
}
