import { NextRequest, NextResponse } from 'next/server'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getNftRedemptionTransactions } from '@/lib/reporting/nftRedemptionsAnalysis'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'redemptions')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const params = request.nextUrl.searchParams
  const workspace = parseWorkspaceSelection(params.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!await isSelectableReportWorkspace(workspace)) return NextResponse.json({ error: 'Select one workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get('limit') ?? '20', 10) || 20))
  const search = (params.get('search') ?? '').trim().slice(0, 128)
  try {
    const data = await getNftRedemptionTransactions(workspace, page, limit, search)
    return NextResponse.json({ ...data, page, limit })
  } catch (error) {
    console.error('NFT redemption transactions error:', error)
    return NextResponse.json({ error: 'Unable to load NFT redemption transactions' }, { status: 500 })
  }
}
