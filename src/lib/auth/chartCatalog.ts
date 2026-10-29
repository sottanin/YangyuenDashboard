export interface ChartCatalogItem { key: string; label: string; menuKey: string }

export const CHART_CATALOG: readonly ChartCatalogItem[] = [
  { key: 'overview.total-transactions', label: 'Total Transactions', menuKey: 'overview' },
  { key: 'overview.total-gas-fee', label: 'Total Gas Fee', menuKey: 'overview' },
  { key: 'overview.token-distributed', label: 'Token Distributed', menuKey: 'overview' },
  { key: 'overview.token-redeemed', label: 'Token Redeemed', menuKey: 'overview' },
  { key: 'overview.redemption-fee', label: 'Redemption Fee', menuKey: 'overview' },
  { key: 'overview.nft-mint', label: 'NFT Mint', menuKey: 'overview' },
  { key: 'overview.nft-burn', label: 'NFT Burn', menuKey: 'overview' },
  { key: 'overview.point-token-distributed', label: 'Point Token Distributed', menuKey: 'overview' },
  { key: 'overview.monthly-transactions', label: 'Total Transactions timeline', menuKey: 'overview' },
  { key: 'overview.transaction-history', label: 'Transaction History', menuKey: 'overview' },
  { key: 'kap20.mint', label: 'Mint', menuKey: 'kap20-analysis' },
  { key: 'kap20.backup-wallet', label: 'Backup Wallet', menuKey: 'kap20-analysis' },
  { key: 'kap20.workspace-wallet', label: 'Workspace Wallet', menuKey: 'kap20-analysis' },
  { key: 'kap20.distributor-pool', label: 'DistributorPool', menuKey: 'kap20-analysis' },
  { key: 'kap20.user-wallet', label: 'User Wallet', menuKey: 'kap20-analysis' },
  { key: 'kap20.redemption-burn', label: 'Redemption (Burn)', menuKey: 'kap20-analysis' },
  { key: 'kap20.redemption-fee', label: 'Redemption Fee', menuKey: 'kap20-analysis' },
  { key: 'kap20.daily-transaction-count', label: 'Daily Transaction Count', menuKey: 'kap20-analysis' },
  { key: 'kap20.daily-transfer-volume', label: 'Daily Token Transfer Volume', menuKey: 'kap20-analysis' },
  { key: 'kap20.activity-heatmap', label: 'Activity Heatmap', menuKey: 'kap20-analysis' },
  { key: 'kap20.conversion-balance', label: 'KAP-20 Reserve for Token Conversion', menuKey: 'kap20-analysis' },
  { key: 'kap20.top-recipients', label: 'Top 10 Token Recipients', menuKey: 'kap20-analysis' },
  { key: 'kap20.top-holders', label: 'Top 10 Token Holders by Balance', menuKey: 'kap20-analysis' },
  { key: 'kap20.transaction-history', label: 'Transaction History', menuKey: 'kap20-analysis' },
  { key: 'kap22.mint', label: 'Mint', menuKey: 'kap22-analysis' },
  { key: 'kap22.distributor-pool', label: 'DistributorPool', menuKey: 'kap22-analysis' },
  { key: 'kap22.operation-pool', label: 'OperationPool', menuKey: 'kap22-analysis' },
  { key: 'kap22.user-wallet', label: 'User Wallet', menuKey: 'kap22-analysis' },
  { key: 'kap22.burn-wallet', label: 'Burn Wallet', menuKey: 'kap22-analysis' },
  { key: 'kap22.expired', label: 'Expired', menuKey: 'kap22-analysis' },
  { key: 'kap22.daily-transaction-count', label: 'Distribution Transactions', menuKey: 'kap22-analysis' },
  { key: 'kap22.daily-transfer-volume', label: 'Points Distributed', menuKey: 'kap22-analysis' },
  { key: 'kap22.activity-heatmap', label: 'Activity Heatmap', menuKey: 'kap22-analysis' },
  { key: 'kap22.top-recipients', label: 'Top 10 Token Recipients', menuKey: 'kap22-analysis' },
  { key: 'kap22.top-holders', label: 'Top 10 Token Holders by Balance', menuKey: 'kap22-analysis' },
  { key: 'kap22.transaction-history', label: 'Transaction History', menuKey: 'kap22-analysis' },
  { key: 'nft.nft-mint', label: 'Vouchers Issued (Mint)', menuKey: 'redemptions' },
  { key: 'nft.nft-burn', label: 'Vouchers Used (Burn)', menuKey: 'redemptions' },
  { key: 'nft.kap20-burn', label: 'Marketplace Redemption Paid (Net)', menuKey: 'redemptions' },
  { key: 'nft.kap20-fee', label: 'Marketplace Fee', menuKey: 'redemptions' },
  { key: 'nft.top-redemptions', label: 'Most Issued Vouchers', menuKey: 'redemptions' },
  { key: 'nft.top-burns', label: 'Most Used Vouchers', menuKey: 'redemptions' },
  { key: 'nft.transaction-history', label: 'Transaction History', menuKey: 'redemptions' },
  { key: 'nft-vouchers.purchase-redeem', label: 'Voucher Purchase Cohort Activity', menuKey: 'nft-vouchers' },
  { key: 'nft-vouchers.voucher-list', label: 'Voucher Inventory and Cards', menuKey: 'nft-vouchers' },
  { key: 'fitivity.total-steps', label: 'Daily Steps per Reporting Participant', menuKey: 'fitivity-overview' },
  { key: 'fitivity.total-calories', label: 'Daily Active Calories per Reporting Participant', menuKey: 'fitivity-overview' },
  { key: 'fitivity.total-sleep', label: 'Daily Sleep per Reporting Participant', menuKey: 'fitivity-overview' },
  { key: 'fitivity.steps-trend', label: 'Average Steps Per Day', menuKey: 'fitivity-overview' },
  { key: 'fitivity.calories-trend', label: 'Average Calories Burn Per Day', menuKey: 'fitivity-overview' },
  { key: 'fitivity.sleep-trend', label: 'Average Sleep Hour Per Day', menuKey: 'fitivity-overview' },
  { key: 'fitivity.top-steps', label: 'Highest Recorded Daily Steps', menuKey: 'fitivity-overview' },
  { key: 'fitivity.top-calories', label: 'Highest Recorded Daily Active Calories', menuKey: 'fitivity-overview' },
  { key: 'fitivity.top-sleep', label: 'Highest Recorded Daily Sleep Duration', menuKey: 'fitivity-overview' },
  { key: 'fitivity.steps-distribution', label: 'Users by Average Daily Steps', menuKey: 'fitivity-overview' },
  { key: 'fitivity.calories-distribution', label: 'Users by Average Daily Calories Burn', menuKey: 'fitivity-overview' },
  { key: 'fitivity.sleep-distribution', label: 'Users by Average Daily Sleep Hour', menuKey: 'fitivity-overview' },
  { key: 'fitivity.user-summary', label: 'Wallet Summary', menuKey: 'fitivity-overview' },
  { key: 'wallet-activity.total-transactions', label: 'Total Transactions', menuKey: 'wallets' },
  { key: 'wallet-activity.token-activity', label: 'Token Activity', menuKey: 'wallets' },
  { key: 'wallet-activity.point-token-activity', label: 'Point Token Activity', menuKey: 'wallets' },
  { key: 'wallet-activity.nft-activity', label: 'NFT Activity', menuKey: 'wallets' },
  { key: 'wallet-activity.token-balance', label: 'Token Balance', menuKey: 'wallets' },
  { key: 'wallet-activity.point-token-balance', label: 'Point Token Balance', menuKey: 'wallets' },
  { key: 'wallet-activity.steps-trend', label: 'Average Steps Per Day', menuKey: 'wallets' },
  { key: 'wallet-activity.calories-trend', label: 'Average Calories Burn Per Day', menuKey: 'wallets' },
  { key: 'wallet-activity.sleep-trend', label: 'Average Sleep Hour Per Day', menuKey: 'wallets' },
  { key: 'wallet-activity.transaction-history', label: 'Transaction History', menuKey: 'wallets' },
  { key: 'wallet-activity.redemption-history', label: 'Redemption History', menuKey: 'wallets' },
  { key: 'wallet-activity.fitivity-history', label: 'Fitivity History', menuKey: 'wallets' },
] as const

export const CHART_KEYS = new Set(CHART_CATALOG.map((chart) => chart.key))
export function chartKeysForMenu(menuKey: string): string[] { return CHART_CATALOG.filter((chart) => chart.menuKey === menuKey).map((chart) => chart.key) }

// Compatibility for the earlier grouped Wallet Activity grants. Expand only
// these known groups; unknown permission names must never become grants.
export const LEGACY_CHART_GROUPS: Readonly<Record<string, readonly string[]>> = {
  'wallet-activity.summary': [
    'wallet-activity.total-transactions', 'wallet-activity.token-activity',
    'wallet-activity.point-token-activity', 'wallet-activity.nft-activity',
    'wallet-activity.token-balance', 'wallet-activity.point-token-balance',
  ],
  'wallet-activity.fitivity-trends': [
    'wallet-activity.steps-trend', 'wallet-activity.calories-trend', 'wallet-activity.sleep-trend',
  ],
}

export function expandChartKeys(keys: readonly string[]): string[] {
  return Array.from(new Set(keys.flatMap((key) => Object.hasOwn(LEGACY_CHART_GROUPS, key) ? LEGACY_CHART_GROUPS[key] : [key])))
}
