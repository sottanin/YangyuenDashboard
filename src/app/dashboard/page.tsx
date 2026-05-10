import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { KpiTile } from '@/components/ui/KpiTile'
import { SkeletonKpi, SkeletonCard } from '@/components/ui/SkeletonCard'
import { OverviewCharts } from './OverviewCharts'
import { RecentTransactionsTable } from './RecentTransactionsTable'

async function OverviewKpis() {
  let totalTx = 0
  let activeWallets = 0
  let totalRedemptions = 0
  let mintCount = 0

  try {
    const [txCount, walletCount, redemptionCount, mintCountResult] = await Promise.all([
      prisma.transactionDetail.count(),
      prisma.wallet.count(),
      prisma.redemptionTransactionDetail.count(),
      prisma.transactionDetail.count({ where: { txType: 'token_minting' } }),
    ])
    totalTx = txCount
    activeWallets = walletCount
    totalRedemptions = redemptionCount
    mintCount = mintCountResult
  } catch {
    // DB not ready — show zeros
  }

  const kpis = [
    {
      label: 'Total Transactions',
      value: totalTx.toLocaleString(),
      change: 8.4,
      spark: [40, 45, 42, 50, 48, 55, 60, 58, 62, 65, 68, 72],
      icon: 'pulse',
      iconBg: 'rgb(99 102 241 / 0.12)',
      sparkColor: 'var(--accent)',
    },
    {
      label: 'Active Wallets',
      value: activeWallets.toLocaleString(),
      change: 3.2,
      spark: [20, 22, 24, 23, 25, 26, 28, 27, 29, 30, 31, 32],
      icon: 'users',
      iconBg: 'rgb(6 182 212 / 0.12)',
      sparkColor: 'var(--accent-3)',
    },
    {
      label: 'Token Transfers',
      value: (totalTx - mintCount).toLocaleString(),
      change: 5.1,
      spark: [30, 32, 35, 33, 36, 38, 40, 39, 42, 44, 46, 48],
      icon: 'box',
      iconBg: 'rgb(139 92 246 / 0.12)',
      sparkColor: 'var(--accent-2)',
    },
    {
      label: 'Total Redemptions',
      value: totalRedemptions.toLocaleString(),
      change: 12.8,
      spark: [5, 6, 5, 7, 8, 9, 8, 10, 11, 12, 13, 14],
      icon: 'cart',
      iconBg: 'rgb(244 63 94 / 0.12)',
      sparkColor: 'var(--danger)',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      {kpis.map((k, i) => (
        <div key={i} className="animate-in" style={{ animationDelay: `${i * 60}ms` }}>
          <KpiTile {...k} />
        </div>
      ))}
    </div>
  )
}

async function RecentTransactions() {
  let transactions: {
    txId: string
    fromHash: string
    toHash: string
    tokenName: string
    value: string
    timestamp: Date
    status: string | null
    txType: string
  }[] = []

  try {
    const raw = await prisma.transactionDetail.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' },
      select: {
        txId: true,
        fromHash: true,
        toHash: true,
        tokenName: true,
        value: true,
        timestamp: true,
        txType: true,
        header: { select: { status: true } },
      },
    })
    transactions = raw.map((t) => ({
      txId: t.txId,
      fromHash: t.fromHash,
      toHash: t.toHash,
      tokenName: t.tokenName,
      value: t.value.toString(),
      timestamp: t.timestamp,
      status: t.header?.status ?? null,
      txType: t.txType,
    }))
  } catch {
    // empty
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">📭</div>
        <div className="text-sm font-medium text-default">No transactions yet</div>
        <div className="text-xs text-muted mt-1">Run the seed script to import Excel data</div>
      </div>
    )
  }

  return <RecentTransactionsTable rows={transactions} />
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Yangyuen blockchain loyalty token activity dashboard"
        actions={
          <div className="flex items-center gap-2">
            <span className="pill pill-success"><span className="live-dot" />Live</span>
          </div>
        }
      />

      <Suspense fallback={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {[0, 1, 2, 3].map((i) => <SkeletonKpi key={i} />)}
        </div>
      }>
        <OverviewKpis />
      </Suspense>

      <Suspense fallback={
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          <div className="xl:col-span-2"><SkeletonCard height={350} /></div>
          <SkeletonCard height={350} />
        </div>
      }>
        <OverviewCharts />
      </Suspense>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2 animate-in" style={{ animationDelay: '540ms' }}>
          <Card title="Recent Transactions" subtitle="Latest 10 blockchain transactions" noPad>
            <Suspense fallback={
              <div className="p-5 space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="shimmer w-20 h-4 rounded" />
                    <div className="shimmer flex-1 h-4 rounded" />
                    <div className="shimmer w-16 h-4 rounded" />
                  </div>
                ))}
              </div>
            }>
              <RecentTransactions />
            </Suspense>
          </Card>
        </div>
        <div className="animate-in" style={{ animationDelay: '600ms' }}>
          <Card title="Live Activity" subtitle="Real-time signal" action={
            <span className="pill pill-success"><span className="live-dot" />Live</span>
          }>
            <LiveActivitySection />
          </Card>
        </div>
      </div>
    </>
  )
}

function LiveActivitySection() {
  return (
    <div>
      <div className="text-xs text-muted">Real-time transaction feed</div>
      <div className="mt-3 space-y-3">
        {[
          { icon: 'pulse', type: 'accent', title: 'Mint detected', body: 'ICC-YANGYUEN · 500 tokens', time: 'just now' },
          { icon: 'cart', type: 'success', title: 'NFT redeemed', body: 'Food-01 Hanberger Box Set', time: '2m ago' },
          { icon: 'box', type: 'muted', title: 'Transfer complete', body: 'Green token · 250 units', time: '5m ago' },
          { icon: 'alert', type: 'warn', title: 'High gas price', body: 'Above normal threshold', time: '12m ago' },
        ].map((n, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `rgb(var(--${n.type === 'success' ? 'success' : n.type === 'warn' ? 'warn' : n.type === 'accent' ? 'accent' : 'text-muted'}) / 0.12)` }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-default truncate">{n.title}</div>
              <div className="text-[11px] text-muted truncate">{n.body}</div>
              <div className="text-[10px] text-faint mt-0.5">{n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
