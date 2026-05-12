import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDefaultSuperAdmin } from '@/lib/auth/admin'
import { verifyPassword } from '@/lib/auth/password'
import { createSessionToken, getSessionExpiry, SESSION_COOKIE } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    await ensureDefaultSuperAdmin()

    const body = await req.json() as { username?: string; password?: string }
    const username = body.username?.trim()
    const password = body.password || ''

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    const admin = await prisma.adminUser.findFirst({
      where: {
        OR: [{ username }, { email: username }],
      },
    })

    if (!admin || !admin.active || !verifyPassword(password, admin.passwordHash)) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    const token = await createSessionToken({
      id: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
    })
    const response = NextResponse.json({
      user: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    })

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: getSessionExpiry(),
    })

    return response
  } catch (error) {
    console.error('Login error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Failed to login' }, { status: 500 })
  }
}
