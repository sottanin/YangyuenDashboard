import { NextRequest, NextResponse } from 'next/server'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getNftRedemptionsSummary } from '@/lib/reporting/nftRedemptionsAnalysis'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'redemptions') || !canAccessAnyChart(admin, ['nft.nft-mint', 'nft.nft-burn', 'nft.kap20-burn', 'nft.kap20-fee'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!await isSelectableReportWorkspace(workspace)) return NextResponse.json({ error: 'Select one workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    const summary = await getNftRedemptionsSummary(workspace)
    return NextResponse.json({ ...summary,
      nftMint: canAccessChart(admin, 'nft.nft-mint') ? summary.nftMint : 0,
      nftBurn: canAccessChart(admin, 'nft.nft-burn') ? summary.nftBurn : 0,
      kap20Burn: canAccessChart(admin, 'nft.kap20-burn') ? summary.kap20Burn : '0',
      kap20Fee: canAccessChart(admin, 'nft.kap20-fee') ? summary.kap20Fee : '0',
    })
  } catch (error) {
    console.error('NFT redemption summary error:', error)
    return NextResponse.json({ error: 'Unable to load NFT redemption summary' }, { status: 500 })
  }
}
