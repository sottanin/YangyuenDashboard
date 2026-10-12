import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, getCurrentAdmin } from '@/lib/auth/admin'

export async function POST() {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'batch-logs')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const requestedAt = new Date()
  const coordinators = await prisma.batchJobLog.updateMany({
    where: { status: 'running', tokenName: { in: ['ManualBatchPipeline', 'ScheduledBatchPipeline'] } },
    data: { stoppedReason: 'cancellation_requested', error: 'Manual cancellation requested' },
  })
  const workers = await prisma.batchJobLog.updateMany({
    where: { status: 'running', tokenName: { notIn: ['ManualBatchPipeline', 'ScheduledBatchPipeline'] } },
    data: { status: 'failed', finishedAt: new Date(), error: 'Manually cancelled' },
  })
  return NextResponse.json({ cancellationRequested: coordinators.count, cancelledWorkers: workers.count, requestedAt })
}
