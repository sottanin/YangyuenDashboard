import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessAnyChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { isValidAddress } from '@/lib/system/addresses'
import { parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import { KAP22_REPORT_KEY, resolveAnnotationScope, validateAnnotationInput } from '@/lib/reporting/kap22Annotations'

interface RouteContext { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap22-analysis') || !canAccessAnyChart(admin, ['kap22.daily-transaction-count', 'kap22.daily-transfer-volume'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid annotation' }, { status: 400 })
    const source = body as Record<string, unknown>
    const workspace = parseWorkspaceSelection(typeof source.workspace === 'string' ? source.workspace : null)
    const token = typeof source.token === 'string' ? source.token : ''
    if (workspace === null || !isValidAddress(token)) return NextResponse.json({ error: 'Invalid annotation' }, { status: 400 })
    if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
    const validated = await validateAnnotationInput({ token, workspace, date: typeof source.date === 'string' ? source.date : '', event: typeof source.event === 'string' ? source.event : '' })
    if (!validated) return NextResponse.json({ error: 'Date or event is invalid' }, { status: 400 })
    const current = await prisma.chartAnnotation.findFirst({ where: { id, reportKey: KAP22_REPORT_KEY, tokenContractId: validated.tokenContractId, workspaceSelectionId: validated.workspaceSelectionId } })
    if (!current) return NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
    const annotation = await prisma.chartAnnotation.update({ where: { id }, data: { date: validated.date, event: validated.event, updatedByAdminId: admin.id }, select: { id: true, date: true, event: true, createdAt: true, updatedAt: true } })
    return NextResponse.json({ ...annotation, date: annotation.date.toISOString().slice(0, 10) })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    console.error('KAP-22 annotation PUT error:', error)
    return NextResponse.json({ error: 'Failed to update annotation' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap22-analysis') || !canAccessAnyChart(admin, ['kap22.daily-transaction-count', 'kap22.daily-transfer-volume'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (!isValidAddress(token) || workspace === null) return NextResponse.json({ error: 'Invalid annotation scope' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const scope = await resolveAnnotationScope(token, workspace)
  if (!scope) return NextResponse.json({ error: 'Invalid annotation scope' }, { status: 400 })
  const result = await prisma.chartAnnotation.deleteMany({ where: { id, reportKey: KAP22_REPORT_KEY, tokenContractId: scope.tokenContractId, workspaceSelectionId: scope.workspaceSelectionId } })
  if (result.count === 0) return NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
