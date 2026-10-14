'use client'

import { createContext, useContext } from 'react'

const ChartPermissionContext = createContext<readonly string[]>([])

export function ChartPermissionProvider({ chartKeys, children }: { chartKeys: readonly string[]; children: React.ReactNode }): React.JSX.Element {
  return <ChartPermissionContext.Provider value={chartKeys}>{children}</ChartPermissionContext.Provider>
}

export function useChartPermissions(): { canViewChart: (chartKey: string) => boolean } {
  const chartKeys = useContext(ChartPermissionContext)
  return { canViewChart: (chartKey: string): boolean => chartKeys.includes('*') || chartKeys.includes(chartKey) }
}
