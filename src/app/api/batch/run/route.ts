import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth/admin'
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

  const running = await prisma.batchJobLog.findFirst({ where: { status: 'running' } })
  if (running) {
    return NextResponse.json({ message: 'Batch job already running' }, { status: 409 })
  }

  let jobs: JobKey[] = []
  try {
    const body = await req.json()
    if (Array.isArray(body?.jobs)) jobs = body.jobs.filter((j: string) => j in JOB_FNS)
  } catch { /* no body = run all */ }

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
