export const MENU_CATALOG = [
  { key: 'overview', label: 'Overview', section: 'Workspace', href: '/dashboard', icon: 'home' },
  { key: 'analytics', label: 'Analytics', section: 'Workspace', href: '/dashboard/analytics', icon: 'bar' },
  { key: 'reports', label: 'Reports', section: 'Workspace', href: '/dashboard/reports', icon: 'doc' },
  { key: 'transactions', label: 'Transactions', section: 'Blockchain', href: '/dashboard/transactions', icon: 'cart', badge: 'Live' },
  { key: 'redemptions', label: 'Redemptions', section: 'Blockchain', href: '/dashboard/redemptions', icon: 'refresh' },
  { key: 'tokens', label: 'Tokens', section: 'Blockchain', href: '/dashboard/tokens', icon: 'box' },
  { key: 'kap20-analysis', label: 'KAP-20 Analysis', section: 'Blockchain', href: '/dashboard/kap20-analysis', icon: 'bar' },
  { key: 'kap22-analysis', label: 'KAP-22 Analysis', section: 'Blockchain', href: '/dashboard/kap22-analysis', icon: 'bar' },
  { key: 'wallets', label: 'Wallets', section: 'Blockchain', href: '/dashboard/wallets', icon: 'users' },
  { key: 'batch-logs', label: 'Batch Logs', section: 'System', href: '/dashboard/batch-logs', icon: 'refresh', badge: 'Job' },
  { key: 'contracts', label: 'Contracts', section: 'System', href: '/dashboard/contracts', icon: 'doc' },
  { key: 'workspaces', label: 'Workspaces', section: 'System', href: '/dashboard/workspaces', icon: 'target' },
  { key: 'admin-users', label: 'Admin Users', section: 'System', href: '/dashboard/admin-users', icon: 'users' },
  { key: 'roles', label: 'Roles', section: 'System', href: '/dashboard/roles', icon: 'lock' },
  { key: 'settings', label: 'Settings', section: 'System', href: '/dashboard/settings', icon: 'gear' },
] as const

export type MenuKey = typeof MENU_CATALOG[number]['key']

export function menuKeyForPath(pathname: string): MenuKey | null {
  const matches = MENU_CATALOG
    .filter((menu) => menu.href === '/dashboard' ? pathname === menu.href : pathname.startsWith(menu.href))
    .sort((left, right) => right.href.length - left.href.length)
  return matches[0]?.key ?? null
}
