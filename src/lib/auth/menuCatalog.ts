export const MENU_CATALOG = [
  { key: 'overview', label: 'Overview', section: 'Workspace', href: '/dashboard', icon: 'home' },
  { key: 'kap20-analysis', label: 'Tokens (KAP-20)', section: 'Blockchain', href: '/dashboard/tokens', icon: 'bar' },
  { key: 'kap22-analysis', label: 'Point Tokens (KAP-22)', section: 'Blockchain', href: '/dashboard/point-tokens', icon: 'bar' },
  { key: 'redemptions', label: 'NFT Redemptions (KAP-721)', section: 'Blockchain', href: '/dashboard/nft-redemptions', icon: 'box' },
  { key: 'wallets', label: 'Wallets', section: 'Blockchain', href: '/dashboard/wallets', icon: 'users' },
  { key: 'batch-logs', label: 'Batch Logs', section: 'System', href: '/dashboard/batch-logs', icon: 'refresh', badge: 'Job' },
  { key: 'contracts', label: 'Contracts', section: 'System', href: '/dashboard/contracts', icon: 'doc' },
  { key: 'nft-instances', label: 'NFT Instances', section: 'System', href: '/dashboard/nft-instances', icon: 'box' },
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
