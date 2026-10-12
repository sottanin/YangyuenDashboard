import { getCurrentAdmin } from '@/lib/auth/admin'

export type SystemMutationAuthorization = 'unauthorized' | 'forbidden' | 'allowed'

export async function authorizeSystemMutation(): Promise<SystemMutationAuthorization> {
  const admin = await getCurrentAdmin()
  if (!admin) return 'unauthorized'
  return admin.role === 'superadmin' ? 'allowed' : 'forbidden'
}
