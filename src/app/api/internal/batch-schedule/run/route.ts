import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startBatchPipeline } from '@/lib/batchPipeline'

export const runtime = 'nodejs'

function authorized(request: NextRequest): boolean {
  const secret = process.env.BATCH_SCHEDULER_SECRET
  const authorization = request.headers.get('authorization')
  if (!secret || secret.length < 32 || !authorization?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(authorization.slice(7))
  const expected = Buffer.from(secret)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const config = await prisma.systemConfig.findUnique({ where: { key: 'batchScheduleEnabled' }, select: { value: true } })
  if (config?.value !== 'true') return NextResponse.json({ started: false, reason: 'schedule_disabled' })
  const started = await startBatchPipeline('scheduled')
  return NextResponse.json({ started, reason: started ? 'started' : 'job_already_running' }, { status: started ? 202 : 409 })
}
