import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ensureDefaultSuperAdmin, getCurrentAdmin } from '@/lib/auth/admin'
import { hashPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/prisma'

const ROLES = ['admin', 'superadmin']

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
}) {
  return user
}

export async function GET() {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    },
  })

  return NextResponse.json(users.map(serializeAdmin))
}

export async function POST(req: NextRequest) {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (currentAdmin.role !== 'superadmin') {
    return NextResponse.json({ error: 'Only superadmin can create admin users' }, { status: 403 })
  }

  try {
    const body = await req.json() as {
      username?: string
      name?: string
      email?: string
      role?: string
      password?: string
      active?: boolean
    }
    const username = body.username?.trim()
    const name = body.name?.trim()
    const email = body.email?.trim() || null
    const role = body.role || 'admin'
    const password = body.password || ''

    if (!username || !name || !password) {
      return NextResponse.json({ error: 'Username, name, and password are required' }, { status: 400 })
    }
    if (!ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const user = await prisma.adminUser.create({
      data: {
        username,
        name,
        email,
        role,
        active: body.active ?? true,
        passwordHash: hashPassword(password),
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

    return NextResponse.json(serializeAdmin(user), { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Username or email already exists' }, { status: 409 })
    }
    console.error('Admin user create error:', error)
    return NextResponse.json({ error: 'Failed to create admin user' }, { status: 500 })
  }
}
