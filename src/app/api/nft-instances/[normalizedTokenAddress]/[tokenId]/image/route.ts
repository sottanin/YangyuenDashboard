import { NextResponse } from 'next/server'
import { allowedWorkspaceIds, canAccessMenu, getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'
import { fetchRemoteImage } from '@/lib/system/remoteImage'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ normalizedTokenAddress: string; tokenId: string }> },
): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return new NextResponse(null, { status: 401 })
  if (!canAccessMenu(admin, 'nft-instances')) return new NextResponse(null, { status: 403 })

  const { normalizedTokenAddress, tokenId } = await params
  const normalizedAddress = normalizedTokenAddress.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(normalizedAddress) || tokenId.length === 0 || tokenId.length > 256) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const workspaceIds = allowedWorkspaceIds(admin)
    const contract = await prisma.tokenContract.findFirst({
      where: {
        normalizedAddress,
        active: true,
        standard: 'KAP-721',
        ...(workspaceIds === null ? {} : { workspaceId: { in: workspaceIds } }),
      },
      select: { id: true },
    })
    if (!contract) return new NextResponse(null, { status: 404 })

    const instance = await prisma.nFTInstance.findUnique({
      where: { normalizedTokenAddress_id: { normalizedTokenAddress: normalizedAddress, id: tokenId } },
      select: { imageUrl: true },
    })
    if (!instance?.imageUrl) return new NextResponse(null, { status: 404 })
    const remote = await fetchRemoteImage(instance.imageUrl)
    if (!remote) return new NextResponse(null, { status: 404 })
    return new NextResponse(Uint8Array.from(remote.bytes).buffer, {
      headers: {
        'Content-Type': remote.contentType,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('NFT instance image proxy error:', error)
    return new NextResponse(null, { status: 500 })
  }
}
