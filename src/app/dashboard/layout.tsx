import { ThemeProvider } from '@/components/ThemeProvider'
import { DashboardShell } from '@/components/layout/DashboardShell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DashboardShell>{children}</DashboardShell>
    </ThemeProvider>
  )
}
