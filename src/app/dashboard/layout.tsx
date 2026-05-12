import { ThemeProvider } from '@/components/ThemeProvider'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { requireAdmin } from '@/lib/auth/admin'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()

  return (
    <ThemeProvider>
      <DashboardShell admin={admin}>{children}</DashboardShell>
    </ThemeProvider>
  )
}
