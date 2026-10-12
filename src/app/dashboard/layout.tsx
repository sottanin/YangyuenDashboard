import { ThemeProvider } from '@/components/ThemeProvider'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { allowedMenuKeys, isSuperAdmin, requireAdmin } from '@/lib/auth/admin'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { MENU_CATALOG, menuKeyForPath } from '@/lib/auth/menuCatalog'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const pathname = (await headers()).get('x-dashboard-pathname') ?? '/dashboard'
  const menuKey = menuKeyForPath(pathname)
  const menuKeys = allowedMenuKeys(admin)
  if (menuKey && !isSuperAdmin(admin) && !menuKeys.includes(menuKey)) {
    redirect(MENU_CATALOG.find((menu) => menuKeys.includes(menu.key))?.href ?? '/admin/login')
  }

  return (
    <ThemeProvider>
      <DashboardShell admin={{ ...admin, menuKeys, allWorkspaces: isSuperAdmin(admin) }}>{children}</DashboardShell>
    </ThemeProvider>
  )
}
