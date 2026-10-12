import { prisma } from '@/lib/prisma'
import { runBatchJob, runFeeUpdateJob, runNFTInstanceUpdateJob, runRedemptionBatchJob, runWalletSyncJob } from '@/lib/batchJob'

export type BatchJobKey = 'token_sync' | 'redemption' | 'wallet_sync' | 'fee_update' | 'nft_instance'
export type BatchTrigger = 'manual' | 'scheduled'

export const BATCH_JOB_FNS: Record<BatchJobKey, (coordinatorId?: string) => Promise<void>> = {
  token_sync: runBatchJob,
  redemption: runRedemptionBatchJob,
  wallet_sync: runWalletSyncJob,
  fee_update: runFeeUpdateJob,
  nft_instance: runNFTInstanceUpdateJob,
}

async function claimPipeline(trigger: BatchTrigger, jobs: BatchJobKey[] | null): Promise<{ id: string } | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(93422000)`
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await tx.batchJobLog.updateMany({
      where: { status: 'running', startedAt: { lt: staleBefore } },
      data: { status: 'failed', finishedAt: new Date(), error: 'Recovered stale batch lock after 24 hours' },
    })
    const running = await tx.batchJobLog.findFirst({ where: { status: 'running' }, select: { id: true } })
    if (running) return null
    return tx.batchJobLog.create({
      data: {
        status: 'running',
        tokenName: trigger === 'scheduled' ? 'ScheduledBatchPipeline' : 'ManualBatchPipeline',
        tokenAddress: jobs?.join(',') ?? 'all',
      },
      select: { id: true },
    })
  })
}

async function executePipeline(coordinatorId: string, jobs: BatchJobKey[] | null): Promise<void> {
  try {
    if (jobs) {
      await runParallel(jobs.map((job) => BATCH_JOB_FNS[job](coordinatorId)))
    } else {
      await runParallel([runBatchJob(coordinatorId), runRedemptionBatchJob(coordinatorId)])
      await assertCoordinatorActive(coordinatorId)
      await runWalletSyncJob(coordinatorId)
      await assertCoordinatorActive(coordinatorId)
      await runParallel([runFeeUpdateJob(coordinatorId), runNFTInstanceUpdateJob(coordinatorId)])
    }
    await assertCoordinatorActive(coordinatorId)
    await prisma.batchJobLog.updateMany({
      where: { id: coordinatorId, status: 'running' },
      data: { status: 'completed', finishedAt: new Date(), stoppedReason: 'pipeline_completed' },
    })
  } catch (error) {
    console.error('[BatchPipeline] Fatal error:', error)
    await prisma.batchJobLog.updateMany({
      where: { id: coordinatorId, status: 'running' },
      data: { status: 'failed', finishedAt: new Date(), error: error instanceof Error ? error.message : String(error) },
    })
  }
}

async function runParallel(tasks: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(tasks)
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failures.length > 0) {
    const messages = failures.map((failure) => failure.reason instanceof Error ? failure.reason.message : String(failure.reason))
    throw new Error(messages.join('; '))
  }
}

async function assertCoordinatorActive(coordinatorId: string): Promise<void> {
  const coordinator = await prisma.batchJobLog.findUnique({ where: { id: coordinatorId }, select: { status: true, stoppedReason: true } })
  if (coordinator?.status !== 'running' || coordinator.stoppedReason === 'cancellation_requested') throw new Error('Batch pipeline was cancelled')
}

export async function startBatchPipeline(trigger: BatchTrigger, jobs: BatchJobKey[] | null = null): Promise<boolean> {
  const coordinator = await claimPipeline(trigger, jobs)
  if (!coordinator) return false
  void executePipeline(coordinator.id, jobs)
  return true
}
