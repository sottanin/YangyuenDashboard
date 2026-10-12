import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { canAccessMenu, ensureDefaultSuperAdmin, getCurrentAdmin, isSuperAdmin } from '@/lib/auth/admin'
import { hashPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/prisma'

function serializeAdmin(user: {
  id: string
  username: string
  name: string
  email: string | null
  role: string
  active: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
  roles: Array<{ role: { id: string; name: string } }>
  workspaces: Array<{ workspace: { id: number; name: string } }>
}) {
  return user
}

export async function GET() {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(currentAdmin, 'admin-users')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureDefaultSuperAdmin()
  const users = await prisma.adminUser.findMany({
    orderBy: [{ role: 'desc' }, { username: 'asc' }],
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

  return NextResponse.json(users.map(serializeAdmin))
}

export async function POST(req: NextRequest) {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(currentAdmin)) {
    return NextResponse.json({ error: 'Only superadmin can create admin users' }, { status: 403 })
  }

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
    const username = body.username?.trim()
    const name = body.name?.trim()
    const email = body.email?.trim() || null
    if (!Array.isArray(body.roleIds) || !body.roleIds.every((value) => typeof value === 'string')) return NextResponse.json({ error: 'Invalid role selection' }, { status: 400 })
    if (!Array.isArray(body.workspaceIds) || !body.workspaceIds.every((value) => Number.isSafeInteger(value) && value > 0)) return NextResponse.json({ error: 'Invalid workspace selection' }, { status: 400 })
    const roleIds = Array.from(new Set(body.roleIds))
    const workspaceIds = Array.from(new Set(body.workspaceIds))
    const password = body.password || ''

    if (!username || !name || !password) {
      return NextResponse.json({ error: 'Username, name, and password are required' }, { status: 400 })
    }
    if (roleIds.length === 0) return NextResponse.json({ error: 'Select at least one role' }, { status: 400 })
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const selectedRoles = await prisma.adminRole.findMany({ where: { id: { in: roleIds } } })
    if (selectedRoles.length !== roleIds.length) return NextResponse.json({ error: 'Invalid role selection' }, { status: 400 })
    const isSuper = selectedRoles.some((item) => item.name === 'Superadmin')
    if (!isSuper && workspaceIds.length === 0) return NextResponse.json({ error: 'Select at least one workspace' }, { status: 400 })
    const workspaceCount = await prisma.workspace.count({ where: { id: { in: workspaceIds } } })
    if (!isSuper && workspaceCount !== workspaceIds.length) return NextResponse.json({ error: 'Invalid workspace selection' }, { status: 400 })
    const user = await prisma.adminUser.create({
      data: {
        username,
        name,
        email,
        role: isSuper ? 'superadmin' : 'admin',
        active: body.active ?? true,
        passwordHash: hashPassword(password),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
        workspaces: { create: isSuper ? [] : workspaceIds.map((workspaceId) => ({ workspaceId })) },
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

    return NextResponse.json(serializeAdmin(user), { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Username or email already exists' }, { status: 409 })
    }
    console.error('Admin user create error:', error)
    return NextResponse.json({ error: 'Failed to create admin user' }, { status: 500 })
  }
}
