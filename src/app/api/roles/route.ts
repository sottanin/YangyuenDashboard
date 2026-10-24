import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { canAccessMenu, getCurrentAdmin, isSuperAdmin } from '@/lib/auth/admin'
import { MENU_CATALOG } from '@/lib/auth/menuCatalog'
import { CHART_CATALOG, CHART_KEYS, chartKeysForMenu, expandChartKeys } from '@/lib/auth/chartCatalog'
import { prisma } from '@/lib/prisma'

const menuKeys = new Set<string>(MENU_CATALOG.map((menu) => menu.key))
const retiredMenuKeys = new Set(['reports', 'transactions'])

export async function GET(): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'roles')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const roles = await prisma.adminRole.findMany({
    orderBy: [{ system: 'desc' }, { name: 'asc' }],
    include: { permissions: { select: { menuKey: true } }, chartPermissions: { select: { chartKey: true } }, _count: { select: { users: true } } },
  })
  return NextResponse.json({
    roles: roles.map((role) => ({
      ...role,
      permissions: role.permissions.filter((permission) => menuKeys.has(permission.menuKey)),
      chartPermissions: expandChartKeys(role.chartPermissions.map((permission) => permission.chartKey))
        .filter((key) => CHART_CATALOG.some((chart) => chart.key === key && role.permissions.some((permission) => permission.menuKey === chart.menuKey)))
        .map((chartKey) => ({ chartKey })),
    })),
    menuCatalog: MENU_CATALOG,
    chartCatalog: CHART_CATALOG,
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: 'Only superadmin can manage roles' }, { status: 403 })
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    const source = body as Record<string, unknown>
    const name = typeof source.name === 'string' ? source.name.trim() : ''
    const description = typeof source.description === 'string' ? source.description.trim() : ''
    if (!Array.isArray(source.menuKeys) || !source.menuKeys.every((key) => typeof key === 'string')) return NextResponse.json({ error: 'Invalid menu permission' }, { status: 400 })
    if (new Set(source.menuKeys).size !== source.menuKeys.length) return NextResponse.json({ error: 'Duplicate menu permission' }, { status: 400 })
    const submittedPermissions = Array.from(new Set(source.menuKeys))
    if (source.chartKeys !== undefined && (!Array.isArray(source.chartKeys) || !source.chartKeys.every((key) => typeof key === 'string'))) return NextResponse.json({ error: 'Invalid chart permission' }, { status: 400 })
    if (Array.isArray(source.chartKeys) && new Set(source.chartKeys).size !== source.chartKeys.length) return NextResponse.json({ error: 'Duplicate chart permission' }, { status: 400 })
    if (!name || name.length > 80) return NextResponse.json({ error: 'Role name is required (maximum 80 characters)' }, { status: 400 })
    if (description.length > 500) return NextResponse.json({ error: 'Description maximum is 500 characters' }, { status: 400 })
    if (!submittedPermissions.every((key) => menuKeys.has(key) || retiredMenuKeys.has(key))) return NextResponse.json({ error: 'Invalid menu permission' }, { status: 400 })
    const permissions = submittedPermissions.filter((key) => menuKeys.has(key))
    const submittedCharts = source.chartKeys === undefined ? permissions.flatMap(chartKeysForMenu) : Array.from(new Set(source.chartKeys as string[]))
    if (!submittedCharts.every((key) => CHART_KEYS.has(key))) return NextResponse.json({ error: 'Invalid chart permission' }, { status: 400 })
    const permittedCharts = submittedCharts.filter((key) => CHART_CATALOG.some((chart) => chart.key === key && permissions.includes(chart.menuKey)))
    if (permittedCharts.length !== submittedCharts.length) return NextResponse.json({ error: 'Chart permission requires its parent menu' }, { status: 400 })
    const role = await prisma.adminRole.create({
      data: { name, description: description || null, permissions: { create: permissions.map((menuKey) => ({ menuKey })) }, chartPermissions: { create: permittedCharts.map((chartKey) => ({ chartKey })) } },
      include: { permissions: true, chartPermissions: true, _count: { select: { users: true } } },
    })
    return NextResponse.json(role, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'Role name already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 })
  }
}
