import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { canAccessMenu, getCurrentAdmin, isSuperAdmin } from '@/lib/auth/admin'
import { hashPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(currentAdmin, 'admin-users')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!isSuperAdmin(currentAdmin) && currentAdmin.id !== (await params).id) {
    return NextResponse.json({ error: 'Only superadmin can update other admin users' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await req.json() as {
      username?: string
      name?: string
      email?: string
      roleIds?: string[]
      workspaceIds?: number[]
      password?: string
      active?: boolean
    }

    const existing = await prisma.adminUser.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })

    if (body.roleIds !== undefined && (!Array.isArray(body.roleIds) || !body.roleIds.every((value) => typeof value === 'string'))) {
      return NextResponse.json({ error: 'Invalid role selection' }, { status: 400 })
    }
    if (body.workspaceIds !== undefined && (!Array.isArray(body.workspaceIds) || !body.workspaceIds.every((value) => Number.isSafeInteger(value) && value > 0))) {
      return NextResponse.json({ error: 'Invalid workspace selection' }, { status: 400 })
    }
    // Profile updates must never allow a normal admin to forge role/workspace
    // assignments or account state through a direct API request.
    if (!isSuperAdmin(currentAdmin) && (body.roleIds !== undefined || body.workspaceIds !== undefined || body.active !== undefined)) {
      return NextResponse.json({ error: 'Only superadmin can change roles, workspaces, or account status' }, { status: 403 })
    }
    const existingAssignments = await prisma.adminUser.findUnique({
      where: { id },
      select: { roles: { select: { roleId: true } }, workspaces: { select: { workspaceId: true } } },
    })
    const roleIds = Array.from(new Set(body.roleIds ?? existingAssignments?.roles.map((item) => item.roleId) ?? []))
    const workspaceIds = Array.from(new Set(body.workspaceIds ?? existingAssignments?.workspaces.map((item) => item.workspaceId) ?? []))
    if (roleIds.length === 0) return NextResponse.json({ error: 'Select at least one role' }, { status: 400 })
    const selectedRoles = await prisma.adminRole.findMany({ where: { id: { in: roleIds } } })
    if (selectedRoles.length !== roleIds.length) return NextResponse.json({ error: 'Invalid role selection' }, { status: 400 })
    const nextRole = selectedRoles.some((item) => item.name === 'Superadmin') ? 'superadmin' : 'admin'
    if (nextRole !== 'superadmin' && workspaceIds.length === 0) return NextResponse.json({ error: 'Select at least one workspace' }, { status: 400 })
    const workspaceCount = await prisma.workspace.count({ where: { id: { in: workspaceIds } } })
    if (nextRole !== 'superadmin' && workspaceCount !== workspaceIds.length) return NextResponse.json({ error: 'Invalid workspace selection' }, { status: 400 })
    const nextActive = body.active ?? existing.active

    if (body.password !== undefined && body.password.length > 0 && body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    if (existing.role === 'superadmin' && (nextRole !== 'superadmin' || !nextActive)) {
      const superadminCount = await prisma.adminUser.count({
        where: { role: 'superadmin', active: true, NOT: { id } },
      })
      if (superadminCount === 0) {
        return NextResponse.json({ error: 'At least one active superadmin is required' }, { status: 400 })
      }
    }

    const user = await prisma.adminUser.update({
      where: { id },
      data: {
        username: body.username?.trim() || existing.username,
        name: body.name?.trim() || existing.name,
        email: body.email?.trim() || null,
        role: isSuperAdmin(currentAdmin) ? nextRole : existing.role,
        active: isSuperAdmin(currentAdmin) ? nextActive : existing.active,
        ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
        roles: { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) },
        workspaces: { deleteMany: {}, create: nextRole === 'superadmin' ? [] : workspaceIds.map((workspaceId) => ({ workspaceId })) },
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
        workspaces: { select: { workspace: { select: { id: true, name: true } } } },
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Username or email already exists' }, { status: 409 })
    }
    console.error('Admin user update error:', error)
    return NextResponse.json({ error: 'Failed to update admin user' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(currentAdmin, 'admin-users')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!isSuperAdmin(currentAdmin)) {
    return NextResponse.json({ error: 'Only superadmin can delete admin users' }, { status: 403 })
  }

  const { id } = await params
  if (currentAdmin.id === id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }

  const existing = await prisma.adminUser.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })

  if (existing.role === 'superadmin') {
    const superadminCount = await prisma.adminUser.count({
      where: { role: 'superadmin', active: true, NOT: { id } },
    })
    if (superadminCount === 0) {
      return NextResponse.json({ error: 'At least one active superadmin is required' }, { status: 400 })
    }
  }

  await prisma.adminUser.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
