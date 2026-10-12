import { prisma } from '@/lib/prisma'

export interface WorkspaceReportScope {
  workspaceId: number | null
  tokenAddresses: string[] | null
}

export class WorkspaceNotFoundError extends Error {
  constructor() {
    super('Workspace not found')
    this.name = 'WorkspaceNotFoundError'
  }
}

export function parseWorkspaceSelection(value: string | null): number | 'all' | null {
  if (!value || value === 'all') return 'all'
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export async function getWorkspaceReportScope(selection: number | 'all'): Promise<WorkspaceReportScope> {
  if (selection === 'all') return { workspaceId: null, tokenAddresses: null }
  const selectedWorkspace = await prisma.workspace.findUnique({ where: { id: selection }, select: { id: true } })
  if (!selectedWorkspace) throw new WorkspaceNotFoundError()
  const contracts = await prisma.tokenContract.findMany({
    // Historical rows remain part of the workspace scope after deactivation so
    // registry lifecycle changes cannot make prior transactions disappear.
    where: { workspaceId: selection },
    select: { normalizedAddress: true },
  })
  return { workspaceId: selection, tokenAddresses: Array.from(new Set(contracts.map((contract) => contract.normalizedAddress))) }
}

export function tokenScopeFilter(addresses: string[] | null): { tokenAddress?: { in: string[]; mode: 'insensitive' } } {
  if (addresses === null) return {}
  return { tokenAddress: { in: addresses, mode: 'insensitive' } }
}
