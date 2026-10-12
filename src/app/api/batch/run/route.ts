import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, getCurrentAdmin } from '@/lib/auth/admin'
import { runBatchJob, runRedemptionBatchJob, runWalletSyncJob, runFeeUpdateJob, runNFTInstanceUpdateJob } from '@/lib/batchJob'

type JobKey = 'token_sync' | 'redemption' | 'wallet_sync' | 'fee_update' | 'nft_instance'

const JOB_FNS: Record<JobKey, () => Promise<void>> = {
  token_sync: runBatchJob,
  redemption: runRedemptionBatchJob,
  wallet_sync: runWalletSyncJob,
  fee_update: runFeeUpdateJob,
  nft_instance: runNFTInstanceUpdateJob,
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'batch-logs')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const running = await prisma.batchJobLog.findFirst({ where: { status: 'running' } })
  if (running) {
    return NextResponse.json({ message: 'Batch job already running' }, { status: 409 })
  }

  let jobs: JobKey[] = []
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
      (job): job is JobKey => typeof job === 'string' && Object.hasOwn(JOB_FNS, job),
    )) {
      return NextResponse.json({ error: 'Unknown batch job' }, { status: 400 })
    }
    jobs = Array.from(new Set(candidate.jobs))
  }

  if (jobs.length > 0) {
    // Run only selected jobs in parallel — no pipeline dependency
    Promise.all(jobs.map((j) => JOB_FNS[j]())).catch(console.error)
    return NextResponse.json({ message: `Started: ${jobs.join(', ')}` })
  }

  // Full pipeline: 1. fetch transfers (parallel), 2. sync wallets, 3. fees + NFT instances (parallel)
  Promise.all([runBatchJob(), runRedemptionBatchJob()])
    .then(() => runWalletSyncJob())
    .then(() => Promise.all([runFeeUpdateJob(), runNFTInstanceUpdateJob()]))
    .catch(console.error)

  return NextResponse.json({ message: 'Batch job started' })
}
