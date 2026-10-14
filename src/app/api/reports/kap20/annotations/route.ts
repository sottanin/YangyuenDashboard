import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessAnyChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { isValidAddress } from '@/lib/system/addresses'
import { parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import { KAP20_REPORT_KEY, resolveAnnotationScope, validateAnnotationInput } from '@/lib/reporting/kap22Annotations'

function serialize(annotation: { id: string; date: Date; event: string; createdAt: Date; updatedAt: Date }): object {
  return { ...annotation, date: annotation.date.toISOString().slice(0, 10), createdAt: annotation.createdAt.toISOString(), updatedAt: annotation.updatedAt.toISOString() }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap20-analysis') || !canAccessAnyChart(admin, ['kap20.daily-transaction-count', 'kap20.daily-transfer-volume'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (!isValidAddress(token) || workspace === null) return NextResponse.json({ error: 'Invalid annotation scope' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    const scope = await resolveAnnotationScope(token, workspace, 'kap20')
    if (!scope) return NextResponse.json({ error: 'Token is not active in the selected scope' }, { status: 400 })
    const rows = await prisma.chartAnnotation.findMany({ where: { reportKey: KAP20_REPORT_KEY, ...scope }, select: { id: true, date: true, event: true, createdAt: true, updatedAt: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] })
    return NextResponse.json({ annotations: rows.map(serialize) })
  } catch (error) {
    console.error('KAP-20 annotations GET error:', error)
    return NextResponse.json({ error: 'Failed to load annotations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap20-analysis') || !canAccessAnyChart(admin, ['kap20.daily-transaction-count', 'kap20.daily-transfer-volume'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const row = await prisma.chartAnnotation.create({ data: { reportKey: KAP20_REPORT_KEY, ...data, createdByAdminId: admin.id, updatedByAdminId: admin.id }, select: { id: true, date: true, event: true, createdAt: true, updatedAt: true } })
    return NextResponse.json(serialize(row), { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    console.error('KAP-20 annotations POST error:', error)
    return NextResponse.json({ error: 'Failed to save annotation' }, { status: 500 })
  }
}
