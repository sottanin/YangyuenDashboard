import { NextRequest, NextResponse } from 'next/server'
import { canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getNftVoucherReport } from '@/lib/reporting/nftVouchersAnalysis'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 1_000_000) : 1
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'nft-vouchers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (workspace === null || workspace === 'all' || !await isSelectableReportWorkspace(workspace)) {
    return NextResponse.json({ error: 'Select one workspace' }, { status: 400 })
  }
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })

  const includeActivity = canAccessChart(admin, 'nft-vouchers.purchase-redeem')
  const includeVouchers = canAccessChart(admin, 'nft-vouchers.voucher-list')
  if (!includeActivity && !includeVouchers) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    return NextResponse.json(await getNftVoucherReport(workspace, parsePage(request.nextUrl.searchParams.get('page')), includeActivity, includeVouchers))
  } catch (error) {
    console.error('NFT voucher report error:', error)
    return NextResponse.json({ error: 'Unable to load NFT vouchers' }, { status: 500 })
  }
}
