import { NextRequest, NextResponse } from 'next/server'
import { canAccessMenu, getCurrentAdmin } from '@/lib/auth/admin'
import { BATCH_JOB_FNS, startBatchPipeline, type BatchJobKey } from '@/lib/batchPipeline'

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'batch-logs')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let jobs: BatchJobKey[] = []
  const rawBody = await req.text()
  if (rawBody.trim().length > 0) {
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const candidate = body as { jobs?: unknown }
    if (!Array.isArray(candidate.jobs) || candidate.jobs.length === 0) {
      return NextResponse.json({ error: 'jobs must be a non-empty array' }, { status: 400 })
    }
    if (!candidate.jobs.every(
      (job): job is BatchJobKey => typeof job === 'string' && Object.hasOwn(BATCH_JOB_FNS, job),
    )) {
      return NextResponse.json({ error: 'Unknown batch job' }, { status: 400 })
    }
    jobs = Array.from(new Set(candidate.jobs))
  }

  const started = await startBatchPipeline('manual', jobs.length > 0 ? jobs : null)
  if (!started) return NextResponse.json({ message: 'Batch job already running' }, { status: 409 })
  return NextResponse.json({ message: jobs.length > 0 ? `Started: ${jobs.join(', ')}` : 'Batch job started' }, { status: 202 })
}
