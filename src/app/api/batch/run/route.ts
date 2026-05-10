import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runBatchJob, runRedemptionBatchJob, runWalletSyncJob } from '@/lib/batchJob'

export async function POST() {
  const running = await prisma.batchJobLog.findFirst({ where: { status: 'running' } })
  if (running) {
    return NextResponse.json({ message: 'Batch job already running' }, { status: 409 })
  }

  // Run both fetch jobs in parallel, then sync wallet balances
  Promise.all([runBatchJob(), runRedemptionBatchJob()])
    .then(() => runWalletSyncJob())
    .catch(console.error)

  return NextResponse.json({ message: 'Batch job started' })
}
