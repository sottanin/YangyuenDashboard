import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdmin, isSuperAdmin } from '@/lib/auth/admin'
import { MENU_CATALOG } from '@/lib/auth/menuCatalog'
import { prisma } from '@/lib/prisma'

interface RouteContext { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: 'Only superadmin can manage roles' }, { status: 403 })
  const { id } = await params
  const current = await prisma.adminRole.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  if (current.name === 'Superadmin') return NextResponse.json({ error: 'Superadmin always has full access' }, { status: 409 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  const source = body as Record<string, unknown>
  const name = source.name === undefined ? current.name : typeof source.name === 'string' ? source.name.trim() : ''
  const description = source.description === undefined ? current.description : typeof source.description === 'string' ? source.description.trim() : ''
  if (!name || name.length > 80 || (description?.length ?? 0) > 500) return NextResponse.json({ error: 'Invalid role name or description' }, { status: 400 })
  if (!Array.isArray(source.menuKeys) || !source.menuKeys.every((key) => typeof key === 'string')) return NextResponse.json({ error: 'Invalid menu permission' }, { status: 400 })
  const permissions = Array.from(new Set(source.menuKeys))
  const validKeys = new Set<string>(MENU_CATALOG.map((menu) => menu.key))
  if (!permissions.every((key) => validKeys.has(key))) return NextResponse.json({ error: 'Invalid menu permission' }, { status: 400 })
  const role = await prisma.$transaction(async (tx) => {
    await tx.roleMenuPermission.deleteMany({ where: { roleId: id } })
    return tx.adminRole.update({
      where: { id },
      data: { name, description: description || null, permissions: { create: permissions.map((menuKey) => ({ menuKey })) } },
      include: { permissions: true, _count: { select: { users: true } } },
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
