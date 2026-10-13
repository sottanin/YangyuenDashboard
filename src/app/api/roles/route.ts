import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { canAccessMenu, getCurrentAdmin, isSuperAdmin } from '@/lib/auth/admin'
import { MENU_CATALOG } from '@/lib/auth/menuCatalog'
import { prisma } from '@/lib/prisma'

const menuKeys = new Set<string>(MENU_CATALOG.map((menu) => menu.key))
const retiredMenuKeys = new Set(['reports', 'transactions'])

export async function GET(): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'roles')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const roles = await prisma.adminRole.findMany({
    orderBy: [{ system: 'desc' }, { name: 'asc' }],
    include: { permissions: { select: { menuKey: true } }, _count: { select: { users: true } } },
  })
  return NextResponse.json({
    roles: roles.map((role) => ({
      ...role,
      permissions: role.permissions.filter((permission) => menuKeys.has(permission.menuKey)),
    })),
    menuCatalog: MENU_CATALOG,
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
    const submittedPermissions = Array.from(new Set(source.menuKeys))
    if (!name || name.length > 80) return NextResponse.json({ error: 'Role name is required (maximum 80 characters)' }, { status: 400 })
    if (description.length > 500) return NextResponse.json({ error: 'Description maximum is 500 characters' }, { status: 400 })
    if (!submittedPermissions.every((key) => menuKeys.has(key) || retiredMenuKeys.has(key))) return NextResponse.json({ error: 'Invalid menu permission' }, { status: 400 })
    const permissions = submittedPermissions.filter((key) => menuKeys.has(key))
    const role = await prisma.adminRole.create({
      data: { name, description: description || null, permissions: { create: permissions.map((menuKey) => ({ menuKey })) } },
      include: { permissions: true, _count: { select: { users: true } } },
    })
    return NextResponse.json(role, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'Role name already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 })
  }
}
