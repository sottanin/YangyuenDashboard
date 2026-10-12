import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { isValidAddress } from '@/lib/system/addresses'
import { parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import { KAP20_REPORT_KEY, resolveAnnotationScope, validateAnnotationInput } from '@/lib/reporting/kap22Annotations'

interface Context { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap20-analysis')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid annotation' }, { status: 400 })
    const source = body as Record<string, unknown>
    const workspace = parseWorkspaceSelection(typeof source.workspace === 'string' ? source.workspace : null)
    const token = typeof source.token === 'string' ? source.token : ''
    if (workspace === null || !isValidAddress(token)) return NextResponse.json({ error: 'Invalid annotation' }, { status: 400 })
    if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const data = await validateAnnotationInput({ token, workspace, date: typeof source.date === 'string' ? source.date : '', event: typeof source.event === 'string' ? source.event : '' }, 'kap20')
    if (!data) return NextResponse.json({ error: 'Date or event is invalid' }, { status: 400 })
    const { id } = await params
    const current = await prisma.chartAnnotation.findFirst({ where: { id, reportKey: KAP20_REPORT_KEY, tokenContractId: data.tokenContractId, workspaceSelectionId: data.workspaceSelectionId } })
    if (!current) return NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
    const row = await prisma.chartAnnotation.update({ where: { id }, data: { date: data.date, event: data.event, updatedByAdminId: admin.id }, select: { id: true, date: true, event: true, createdAt: true, updatedAt: true } })
    return NextResponse.json({ ...row, date: row.date.toISOString().slice(0, 10) })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    console.error('KAP-20 annotation PUT error:', error)
    return NextResponse.json({ error: 'Failed to update annotation' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap20-analysis')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (!isValidAddress(token) || workspace === null) return NextResponse.json({ error: 'Invalid annotation scope' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    const scope = await resolveAnnotationScope(token, workspace, 'kap20')
    if (!scope) return NextResponse.json({ error: 'Invalid annotation scope' }, { status: 400 })
    const { id } = await params
    const result = await prisma.chartAnnotation.deleteMany({ where: { id, reportKey: KAP20_REPORT_KEY, ...scope } })
    return result.count ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
  } catch (error) {
    console.error('KAP-20 annotation DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete annotation' }, { status: 500 })
  }
}
