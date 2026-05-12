import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCurrentAdmin } from '@/lib/auth/admin'
import { hashPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/prisma'

const ROLES = ['admin', 'superadmin']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (currentAdmin.role !== 'superadmin' && currentAdmin.id !== (await params).id) {
    return NextResponse.json({ error: 'Only superadmin can update other admin users' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await req.json() as {
      username?: string
      name?: string
      email?: string
      role?: string
      password?: string
      active?: boolean
    }

    const existing = await prisma.adminUser.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })

    const nextRole = body.role || existing.role
    const nextActive = body.active ?? existing.active

    if (!ROLES.includes(nextRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
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
        role: currentAdmin.role === 'superadmin' ? nextRole : existing.role,
        active: currentAdmin.role === 'superadmin' ? nextActive : existing.active,
        ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
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
  if (currentAdmin.role !== 'superadmin') {
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
