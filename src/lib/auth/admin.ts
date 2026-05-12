import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hashPassword } from './password'
import { SESSION_COOKIE, verifySessionToken } from './session'

export async function ensureDefaultSuperAdmin() {
  const count = await prisma.adminUser.count()
  if (count > 0) return

  // Use env var if set, otherwise generate a random password and print it once
  const initialPassword = process.env.SUPERADMIN_INITIAL_PASSWORD || (() => {
    const pwd = randomBytes(16).toString('hex')
    console.warn(`[INIT] No SUPERADMIN_INITIAL_PASSWORD set. Generated superadmin password: ${pwd}`)
    console.warn('[INIT] Please change this password immediately after first login.')
    return pwd
  })()

  await prisma.adminUser.create({
    data: {
      username: 'superadmin',
      name: 'Super Admin',
      email: 'superadmin@yangyuen.local',
      role: 'superadmin',
      passwordHash: hashPassword(initialPassword),
      active: true,
    },
  })
}

export async function getCurrentAdmin() {
  const cookieStore = await cookies()
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
  if (!session) return null

  const admin = await prisma.adminUser.findUnique({
    where: { id: session.id },
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

  if (!admin?.active) return null
  return admin
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login')
  return admin
}
