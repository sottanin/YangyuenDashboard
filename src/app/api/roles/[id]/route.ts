import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdmin, isSuperAdmin } from '@/lib/auth/admin'
import { MENU_CATALOG } from '@/lib/auth/menuCatalog'
import { CHART_CATALOG, CHART_KEYS, chartKeysForMenu, expandChartKeys, LEGACY_CHART_GROUPS } from '@/lib/auth/chartCatalog'
import { prisma } from '@/lib/prisma'

interface RouteContext { params: Promise<{ id: string }> }
const retiredMenuKeys = new Set(['reports', 'transactions'])

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: 'Only superadmin can manage roles' }, { status: 403 })
  const { id } = await params
  const current = await prisma.adminRole.findUnique({ where: { id }, include: { chartPermissions: { select: { chartKey: true } } } })
  if (!current) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  // Protect the immutable privilege boundary by the persisted system flag,
  // rather than by a mutable display name. This also protects any future
  // built-in roles from permission or identity changes through this endpoint.
  if (current.system) return NextResponse.json({ error: 'System roles cannot be changed' }, { status: 409 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  const source = body as Record<string, unknown>
  const name = source.name === undefined ? current.name : typeof source.name === 'string' ? source.name.trim() : ''
  const description = source.description === undefined ? current.description : typeof source.description === 'string' ? source.description.trim() : ''
  if (!name || name.length > 80 || (description?.length ?? 0) > 500) return NextResponse.json({ error: 'Invalid role name or description' }, { status: 400 })
  if (!Array.isArray(source.menuKeys) || !source.menuKeys.every((key) => typeof key === 'string')) return NextResponse.json({ error: 'Invalid menu permission' }, { status: 400 })
  if (new Set(source.menuKeys).size !== source.menuKeys.length) return NextResponse.json({ error: 'Duplicate menu permission' }, { status: 400 })
  const submittedPermissions = Array.from(new Set(source.menuKeys))
  const validKeys = new Set<string>(MENU_CATALOG.map((menu) => menu.key))
  if (!submittedPermissions.every((key) => validKeys.has(key) || retiredMenuKeys.has(key))) return NextResponse.json({ error: 'Invalid menu permission' }, { status: 400 })
  const permissions = submittedPermissions.filter((key) => validKeys.has(key))
  if (source.chartKeys !== undefined && (!Array.isArray(source.chartKeys) || !source.chartKeys.every((key) => typeof key === 'string'))) return NextResponse.json({ error: 'Invalid chart permission' }, { status: 400 })
  if (Array.isArray(source.chartKeys) && new Set(source.chartKeys).size !== source.chartKeys.length) return NextResponse.json({ error: 'Duplicate chart permission' }, { status: 400 })
  const submittedCharts = source.chartKeys === undefined ? permissions.flatMap(chartKeysForMenu) : Array.from(new Set(source.chartKeys as string[]))
  // A stale role editor may still submit a grouped grant already held by this
  // role. Accept only those persisted aliases, then replace them atomically.
  const persistedKeys = new Set(current.chartPermissions.map((permission) => permission.chartKey))
  if (!submittedCharts.every((key) => CHART_KEYS.has(key) || (Object.hasOwn(LEGACY_CHART_GROUPS, key) && persistedKeys.has(key)))) return NextResponse.json({ error: 'Invalid chart permission' }, { status: 400 })
  const normalizedCharts = expandChartKeys(submittedCharts)
  const permittedCharts = normalizedCharts.filter((key) => CHART_CATALOG.some((chart) => chart.key === key && permissions.includes(chart.menuKey)))
  if (permittedCharts.length !== normalizedCharts.length) return NextResponse.json({ error: 'Chart permission requires its parent menu' }, { status: 400 })
  const role = await prisma.$transaction(async (tx) => {
    await tx.roleMenuPermission.deleteMany({ where: { roleId: id } })
    await tx.roleChartPermission.deleteMany({ where: { roleId: id } })
    return tx.adminRole.update({
      where: { id },
      data: { name, description: description || null, permissions: { create: permissions.map((menuKey) => ({ menuKey })) }, chartPermissions: { create: permittedCharts.map((chartKey) => ({ chartKey })) } },
      include: { permissions: true, chartPermissions: true, _count: { select: { users: true } } },
    })
  })
  return NextResponse.json(role)
}

export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: 'Only superadmin can manage roles' }, { status: 403 })
  const { id } = await params
  const role = await prisma.adminRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  if (role.system || role._count.users > 0) return NextResponse.json({ error: role.system ? 'System roles cannot be deleted' : 'Remove this role from users before deleting it' }, { status: 409 })
  await prisma.adminRole.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
