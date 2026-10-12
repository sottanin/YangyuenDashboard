import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hashPassword } from './password'
import { SESSION_COOKIE, verifySessionToken } from './session'

export async function ensureDefaultSuperAdmin() {
  const count = await prisma.adminUser.count()
  if (count > 0) {
    const superRole = await prisma.adminRole.upsert({ where: { name: 'Superadmin' }, create: { id: 'role_superadmin', name: 'Superadmin', description: 'Full access to every menu and workspace', system: true }, update: {} })
    const superadmins = await prisma.adminUser.findMany({ where: { role: 'superadmin' }, select: { id: true } })
    await prisma.adminUserRole.createMany({ data: superadmins.map((admin) => ({ adminUserId: admin.id, roleId: superRole.id })), skipDuplicates: true })
    return
  }

  // Use env var if set, otherwise generate a random password and print it once
  const initialPassword = process.env.SUPERADMIN_INITIAL_PASSWORD || (() => {
    const pwd = randomBytes(16).toString('hex')
    console.warn(`[INIT] No SUPERADMIN_INITIAL_PASSWORD set. Generated superadmin password: ${pwd}`)
    console.warn('[INIT] Please change this password immediately after first login.')
    return pwd
  })()

  const superRole = await prisma.adminRole.upsert({ where: { name: 'Superadmin' }, create: { id: 'role_superadmin', name: 'Superadmin', description: 'Full access to every menu and workspace', system: true }, update: {} })
  await prisma.adminUser.create({
    data: {
      username: 'superadmin',
      name: 'Super Admin',
      email: 'superadmin@yangyuen.local',
      role: 'superadmin',
      passwordHash: hashPassword(initialPassword),
      active: true,
      roles: { create: { roleId: superRole.id } },
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
      roles: { select: { role: { select: { id: true, name: true, permissions: { select: { menuKey: true } } } } } },
      workspaces: { select: { workspaceId: true } },
    },
  })

  if (!admin?.active) return null
  return admin
}

export type CurrentAdmin = NonNullable<Awaited<ReturnType<typeof getCurrentAdmin>>>

export function isSuperAdmin(admin: Pick<CurrentAdmin, 'role'>): boolean {
  return admin.role.toLowerCase() === 'superadmin'
}

export function allowedMenuKeys(admin: CurrentAdmin): string[] {
  if (isSuperAdmin(admin)) return ['*']
  return Array.from(new Set(admin.roles.flatMap((assignment) => assignment.role.permissions.map((permission) => permission.menuKey))))
}

export function canAccessMenu(admin: CurrentAdmin, menuKey: string): boolean {
  return isSuperAdmin(admin) || allowedMenuKeys(admin).includes(menuKey)
}

export function allowedWorkspaceIds(admin: CurrentAdmin): number[] | null {
  return isSuperAdmin(admin) ? null : admin.workspaces.map((assignment) => assignment.workspaceId)
}

export function canAccessWorkspace(admin: CurrentAdmin, workspaceId: number | 'all'): boolean {
  if (isSuperAdmin(admin)) return true
  return workspaceId !== 'all' && admin.workspaces.some((assignment) => assignment.workspaceId === workspaceId)
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin()
  if (!admin) redirect('/admin/login')
  return admin
}
