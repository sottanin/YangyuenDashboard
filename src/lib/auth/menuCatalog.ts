export const MENU_CATALOG = [
  { key: 'overview', label: 'Overview', section: 'Workspace', href: '/dashboard', icon: 'home' },
  { key: 'kap20-analysis', label: 'Tokens (KAP-20)', section: 'Workspace', href: '/dashboard/tokens', icon: 'coin' },
  { key: 'kap22-analysis', label: 'Point Tokens (KAP-22)', section: 'Workspace', href: '/dashboard/point-tokens', icon: 'coins' },
  { key: 'redemptions', label: 'NFT Redemptions (KAP-721)', section: 'Workspace', href: '/dashboard/nft-redemptions', icon: 'nft' },
  { key: 'wallets', label: 'Wallet Activity', section: 'Workspace', href: '/dashboard/wallet-activity', icon: 'wallet' },
  { key: 'fitivity-overview', label: 'Fitivity', section: 'Workspace', href: '/dashboard/fitivity-overview', icon: 'pulse' },
  { key: 'batch-logs', label: 'Batch Logs', section: 'System', href: '/dashboard/batch-logs', icon: 'history', badge: 'Job' },
  { key: 'contracts', label: 'Contracts', section: 'System', href: '/dashboard/contracts', icon: 'contract' },
  { key: 'nft-instances', label: 'NFT Instances', section: 'System', href: '/dashboard/nft-instances', icon: 'nft' },
  { key: 'fitivity-data', label: 'Fitivity Data', section: 'System', href: '/dashboard/fitivity-data', icon: 'database' },
  { key: 'workspaces', label: 'Workspaces', section: 'System', href: '/dashboard/workspaces', icon: 'workspace' },
  { key: 'admin-users', label: 'Admin Users', section: 'System', href: '/dashboard/admin-users', icon: 'users' },
  { key: 'roles', label: 'Roles', section: 'System', href: '/dashboard/roles', icon: 'shield' },
  { key: 'settings', label: 'Settings', section: 'System', href: '/dashboard/settings', icon: 'gear' },
] as const

export type MenuKey = typeof MENU_CATALOG[number]['key']

export function menuKeyForPath(pathname: string): MenuKey | null {
  const matches = MENU_CATALOG
    .filter((menu) => menu.href === '/dashboard' ? pathname === menu.href : pathname.startsWith(menu.href))
    .sort((left, right) => right.href.length - left.href.length)
  return matches[0]?.key ?? null
}
