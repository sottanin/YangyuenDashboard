'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { useWorkspace } from '@/lib/WorkspaceContext'

type SidebarState = 'open' | 'narrow' | 'closed'

interface SidebarProps {
  state: SidebarState
  admin: {
    name: string
    email: string | null
    username: string
    role: string
  }
}

const NAV = [
  {
    section: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', icon: 'home', href: '/dashboard' },
      { id: 'analytics', label: 'Analytics', icon: 'bar', href: '/dashboard/analytics' },
      { id: 'reports', label: 'Reports', icon: 'doc', href: '/dashboard/reports' },
    ],
  },
  {
    section: 'Blockchain',
    items: [
      { id: 'transactions', label: 'Transactions', icon: 'cart', href: '/dashboard/transactions', badge: 'Live' },
      { id: 'redemptions', label: 'Redemptions', icon: 'refresh', href: '/dashboard/redemptions' },
      { id: 'tokens', label: 'Tokens', icon: 'box', href: '/dashboard/tokens' },
      { id: 'wallets', label: 'Wallets', icon: 'users', href: '/dashboard/wallets' },
    ],
  },
  {
    section: 'System',
    items: [
      { id: 'batch-logs', label: 'Batch Logs', icon: 'refresh', href: '/dashboard/batch-logs', badge: 'Job' },
      { id: 'contracts',  label: 'Contracts',  icon: 'doc',     href: '/dashboard/contracts' },
      { id: 'workspaces', label: 'Workspaces', icon: 'target',  href: '/dashboard/workspaces' },
      { id: 'admin-users', label: 'Admin Users', icon: 'users', href: '/dashboard/admin-users' },
      { id: 'settings',   label: 'Settings',   icon: 'gear',    href: '/dashboard/settings' },
    ],
  },
]

export function Sidebar({ state, admin }: SidebarProps) {
  const pathname = usePathname()
  const { selected } = useWorkspace()
  const isNarrow = state === 'narrow'
  if (state === 'closed') return null

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const wsLabel = selected.id === 'all' ? 'All Workspaces' : selected.name
  const wsInitials = selected.id === 'all' ? '∞' : selected.name.slice(0, 2).toUpperCase()

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-30 transition-all duration-200 ease-out ${
        isNarrow ? 'w-[68px] sidebar-narrow' : 'w-[240px]'
      }`}
    >
      <div className="h-full glass-strong border-r border-default flex flex-col p-3">
        {/* Logo */}
        <div className={`flex items-center gap-2.5 px-2 py-3 mb-2 ${isNarrow ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 flex-shrink-0">
            <img src="/logo-fullcolor.svg" alt="Yangyuen" className="w-full h-full object-contain" />
          </div>
          {!isNarrow && (
            <div>
              <div className="text-[13px] font-semibold tracking-tight text-default leading-none">Yangyuen</div>
              <div className="text-[10px] text-muted mt-0.5">Data Analysis</div>
            </div>
          )}
        </div>

        {/* Workspace label */}
        {!isNarrow && (
          <div className="flex items-center gap-2 mx-1 mb-3 px-2.5 py-2 rounded-lg border border-default bg-surface/50">
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgb(var(--accent-2)), rgb(var(--accent-3)))' }}
            >
              {wsInitials}
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-xs font-medium text-default truncate">Yangyuen</div>
              <div className="text-[10px] text-faint truncate">{wsLabel}</div>
            </div>
            <Icon name="chevD" size={12} className="text-faint flex-shrink-0" />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto thin-scroll">
          {NAV.map((section) => (
            <div key={section.section} className="mb-3">
              <div className="nav-section-label text-[10px] uppercase tracking-wider text-faint px-2 mb-1.5 font-medium">
                {section.section}
              </div>
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
                  title={isNarrow ? item.label : undefined}
                >
                  <Icon name={item.icon} size={16} />
                  <span className="nav-label flex-1 text-left">{item.label}</span>
                  {'badge' in item && item.badge && !isNarrow && (
                    <span className="nav-label pill pill-accent text-[10px]" style={{ padding: '1px 6px' }}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-default pt-3 mt-2">
          <div className={`flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-2 cursor-pointer ${isNarrow ? 'justify-center' : ''}`}>
            <div className="avatar" style={{ width: 30, height: 30, fontSize: '10px' }}>
              {admin.name.slice(0, 2).toUpperCase()}
            </div>
            {!isNarrow && (
              <div className="flex-1 min-w-0 sidebar-footer-label">
                <div className="text-xs font-medium text-default truncate">{admin.name}</div>
                <div className="text-[10px] text-faint truncate">{admin.email || admin.username}</div>
              </div>
            )}
            {!isNarrow && <Icon name="chevR" size={12} className="text-faint sidebar-footer-label" />}
          </div>
        </div>
      </div>
    </aside>
  )
}
