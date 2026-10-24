'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { WorkspaceProvider } from '@/lib/WorkspaceContext'
import { ChartPermissionProvider } from '@/lib/ChartPermissionContext'

type SidebarState = 'open' | 'narrow' | 'closed'
interface AdminProfile {
  id: string
  username: string
  name: string
  email: string | null
  role: string
  menuKeys: string[]
  chartKeys: string[]
  allWorkspaces: boolean
}

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/tokens': 'Tokens (KAP-20)',
  '/dashboard/point-tokens': 'Point Tokens (KAP-22)',
  '/dashboard/nft-redemptions': 'NFT Redemptions (KAP-721)',
  '/dashboard/nft-vouchers': 'NFT Vouchers',
  '/dashboard/roles': 'Roles',
  '/dashboard/wallet-activity': 'Wallet Activity',
  '/dashboard/settings': 'Settings',
  '/dashboard/admin-users': 'Admin Users',
  '/dashboard/workspaces': 'Workspaces',
  '/dashboard/batch-logs': 'Batch Logs',
  '/dashboard/contracts': 'Contracts',
  '/dashboard/nft-instances': 'NFT Instances',
  '/dashboard/fitivity-data': 'Fitivity Data',
  '/dashboard/wallet-mapping': 'Wallet Mapping',
  '/dashboard/fitivity-overview': 'Fitivity Overview',
}

export function DashboardShell({ children, admin }: { children: React.ReactNode; admin: AdminProfile }) {
  const pathname = usePathname()
  const [sidebarState, setSidebarState] = useState<SidebarState>('open')

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      const candidate = localStorage.getItem('nx-sidebar')
      const stored: SidebarState = candidate === 'open' || candidate === 'narrow' || candidate === 'closed'
        ? candidate
        : 'open'
      setSidebarState(stored)
    })
    return () => { active = false }
  }, [])

  const toggleSidebar = () => {
    setSidebarState((s) => {
      const next = s === 'open' ? 'narrow' : s === 'narrow' ? 'closed' : 'open'
      localStorage.setItem('nx-sidebar', next)
      return next
    })
  }

  const desktopSidebarClass = sidebarState === 'closed'
    ? 'md:ml-0'
    : sidebarState === 'narrow'
      ? 'md:ml-[68px]'
      : 'md:ml-[240px]'
  const currentPageLabel = PAGE_LABELS[pathname] || 'Dashboard'

  return (
    <WorkspaceProvider allowAllWorkspaces={admin.allWorkspaces}>
      <ChartPermissionProvider chartKeys={admin.chartKeys}>
      <div className="grid-bg" />
      <div className="ambient-bg" />

      <Sidebar state={sidebarState} admin={admin} />

      <main
        className={`relative z-10 ml-0 min-h-screen min-w-0 max-w-full p-6 thin-scroll transition-all duration-200 ease-out ${desktopSidebarClass}`}
        data-density="comfortable"
      >
        <TopBar onToggleSidebar={toggleSidebar} currentPageLabel={currentPageLabel} admin={admin} />
        <div className="min-w-0 max-w-full animate-in">{children}</div>
      </main>
      </ChartPermissionProvider>
    </WorkspaceProvider>
  )
}
