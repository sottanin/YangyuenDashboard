'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { WorkspaceProvider } from '@/lib/WorkspaceContext'

type SidebarState = 'open' | 'narrow' | 'closed'
interface AdminProfile {
  id: string
  username: string
  name: string
  email: string | null
  role: string
}

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/transactions': 'Transactions',
  '/dashboard/tokens': 'Tokens',
  '/dashboard/wallets': 'Wallets',
  '/dashboard/reports': 'Reports',
  '/dashboard/settings': 'Settings',
  '/dashboard/admin-users': 'Admin Users',
  '/dashboard/workspaces': 'Workspaces',
  '/dashboard/batch-logs': 'Batch Logs',
  '/dashboard/contracts': 'Contracts',
  '/dashboard/redemptions': 'Redemptions',
}

export function DashboardShell({ children, admin }: { children: React.ReactNode; admin: AdminProfile }) {
  const pathname = usePathname()
  const [sidebarState, setSidebarState] = useState<SidebarState>('open')

  useEffect(() => {
    const stored = (localStorage.getItem('nx-sidebar') as SidebarState) || 'open'
    setSidebarState(stored)
  }, [])

  const toggleSidebar = () => {
    setSidebarState((s) => {
      const next = s === 'open' ? 'narrow' : s === 'narrow' ? 'closed' : 'open'
      localStorage.setItem('nx-sidebar', next)
      return next
    })
  }

  const sidebarMargin = sidebarState === 'closed' ? 0 : sidebarState === 'narrow' ? 68 : 240
  const currentPageLabel = PAGE_LABELS[pathname] || 'Dashboard'

  return (
    <WorkspaceProvider>
      <div className="grid-bg" />
      <div className="ambient-bg" />

      <Sidebar state={sidebarState} admin={admin} />

      <main
        className="relative z-10 transition-all duration-200 ease-out p-6 thin-scroll"
        style={{ marginLeft: sidebarMargin + 'px', minHeight: '100vh' }}
        data-density="comfortable"
      >
        <TopBar onToggleSidebar={toggleSidebar} currentPageLabel={currentPageLabel} admin={admin} />
        <div className="animate-in">{children}</div>
      </main>
    </WorkspaceProvider>
  )
}
