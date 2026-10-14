import { NextRequest, NextResponse } from 'next/server'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'
import { isSelectableReportWorkspace, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import { detectTokenImageType, readTokenImage } from '@/lib/system/tokenImages'

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return new NextResponse(null, { status: 401 })
  if (!canAccessMenu(admin, 'wallets')) return new NextResponse(null, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (workspace === null || workspace === 'all' || !await isSelectableReportWorkspace(workspace)) return new NextResponse(null, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return new NextResponse(null, { status: 403 })
  const { id } = await params
  if (!id || id.length > 64) return new NextResponse(null, { status: 400 })
  const token = await prisma.tokenContract.findFirst({ where: { id, workspaceId: workspace }, select: { imageKey: true } })
  if (!token?.imageKey) return new NextResponse(null, { status: 404 })
  try {
    const bytes = await readTokenImage(token.imageKey)
    const contentType = detectTokenImageType(bytes)
    if (!contentType) return new NextResponse(null, { status: 404 })
    return new NextResponse(Uint8Array.from(bytes).buffer, { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) {
    console.error('Wallet activity token image error:', error instanceof Error ? error.message : 'unknown')
    return new NextResponse(null, { status: 404 })
  }
}
