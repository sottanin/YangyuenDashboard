import { NextRequest, NextResponse } from 'next/server'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import { normalizeAddress } from '@/lib/system/addresses'
import { fetchRemoteImage } from '@/lib/system/remoteImage'
import { detectTokenImageType, readTokenImage } from '@/lib/system/tokenImages'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return new NextResponse(null, { status: 401 })
  if (!canAccessMenu(admin, 'wallets')) return new NextResponse(null, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (workspace === null || workspace === 'all' || !await isSelectableReportWorkspace(workspace)) return new NextResponse(null, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return new NextResponse(null, { status: 403 })
  const contract = request.nextUrl.searchParams.get('contract')?.trim() ?? ''
  const tokenId = request.nextUrl.searchParams.get('tokenId')?.trim() ?? ''
  if (!/^0x[0-9a-fA-F]{40}$/.test(contract) || tokenId.length > 256) return new NextResponse(null, { status: 400 })

  const normalizedTokenAddress = normalizeAddress(contract)
  const registry = await prisma.tokenContract.findFirst({
    where: { normalizedAddress: normalizedTokenAddress, standard: 'KAP-721', active: true, OR: [{ workspaceId: workspace }, { aggregateAcrossWorkspaces: true }] },
    select: { imageKey: true },
  })
  if (!registry) return new NextResponse(null, { status: 404 })
  const instance = tokenId
    ? await prisma.nFTInstance.findUnique({
        where: { normalizedTokenAddress_id: { normalizedTokenAddress, id: tokenId } },
        select: { imageUrl: true },
      })
    : null
  if (instance?.imageUrl) {
    const remote = await fetchRemoteImage(instance.imageUrl)
    if (remote) return new NextResponse(Uint8Array.from(remote.bytes).buffer, { headers: { 'Content-Type': remote.contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
  }
  if (registry.imageKey) {
    try {
      const bytes = await readTokenImage(registry.imageKey)
      const contentType = detectTokenImageType(bytes)
      if (contentType) return new NextResponse(Uint8Array.from(bytes).buffer, { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
    } catch (error) {
      console.error('Wallet activity NFT fallback image error:', error instanceof Error ? error.message : 'unknown')
    }
  }
  return new NextResponse(null, { status: 404 })
}
