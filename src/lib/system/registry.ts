import { normalizeAddress, isValidAddress } from './addresses'

export const TOKEN_ROLES = ['PRIMARY_TOKEN', 'POINT_TOKEN', 'REDEMPTION_NFT', 'OTHER'] as const
export const TOKEN_STANDARDS = ['KAP-20', 'KAP-22', 'KAP-721'] as const
export const ADDRESS_ROLES = ['ZERO', 'INITIAL_MINT', 'MAIN', 'WORKSPACE', 'DISTRIBUTOR_POOL', 'OPERATION_POOL', 'LOYALTY_SWAP', 'MARKETPLACE', 'MARKETPLACE_FEE', 'OTHER'] as const

export type TokenRole = typeof TOKEN_ROLES[number]
export type TokenStandard = typeof TOKEN_STANDARDS[number]
export type AddressRole = typeof ADDRESS_ROLES[number]

export interface TokenRegistryInput {
  name: string
  address: string
  normalizedAddress: string
  symbol: string | null
  standard: TokenStandard
  decimals: number | null
  role: TokenRole
  active: boolean
  workspaceId: number
}

export interface AddressRegistryInput {
  name: string
  address: string
  normalizedAddress: string
  role: AddressRole
  version: string | null
  active: boolean
  workspaceId: number | null
}

function parseWorkspaceId(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return undefined
  return value
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length <= maxLength ? trimmed : undefined
}

export function parseTokenRegistryInput(input: unknown): { data?: TokenRegistryInput; error?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Request body must be an object' }
  const body = input as Record<string, unknown>
  const name = boundedText(body.name, 100) ?? ''
  const address = boundedText(body.address, 42) ?? ''
  const symbol = (boundedText(body.symbol, 20) ?? '').toUpperCase()
  const standard = body.standard
  const role = body.role
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const active = body.active === undefined ? true : body.active
  if (!name) return { error: 'Name is required and must be at most 100 characters' }
  if (!isValidAddress(address)) return { error: 'Address must contain 0x followed by 40 hexadecimal characters' }
  if (typeof standard !== 'string' || !TOKEN_STANDARDS.includes(standard as TokenStandard)) return { error: 'Token standard is invalid' }
  if (typeof role !== 'string' || !TOKEN_ROLES.includes(role as TokenRole)) return { error: 'Token role is invalid' }
  if (!symbol) return { error: 'Symbol is required' }
  if (workspaceId === undefined || workspaceId === null) return { error: 'Workspace is required' }
  if (typeof active !== 'boolean') return { error: 'Active must be a boolean' }
  let decimals: number | null = null
  if (standard !== 'KAP-721') {
    if (typeof body.decimals !== 'number' || !Number.isInteger(body.decimals) || body.decimals < 0 || body.decimals > 36) {
      return { error: 'Decimals must be a whole number from 0 to 36 for fungible tokens' }
    }
    decimals = body.decimals
  }
  return { data: { name, address, normalizedAddress: normalizeAddress(address), symbol, standard: standard as TokenStandard, decimals, role: role as TokenRole, active, workspaceId } }
}

export function parseAddressRegistryInput(input: unknown): { data?: AddressRegistryInput; error?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Request body must be an object' }
  const body = input as Record<string, unknown>
  const name = boundedText(body.name, 100) ?? ''
  const address = boundedText(body.address, 42) ?? ''
  const role = body.role
  const rawVersion = body.version === null || body.version === undefined || body.version === '' ? null : boundedText(body.version, 30)
  const version = rawVersion || null
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const active = body.active === undefined ? true : body.active
  if (!name) return { error: 'Display name is required and must be at most 100 characters' }
  if (rawVersion === undefined) return { error: 'Version must be at most 30 characters' }
  if (!isValidAddress(address)) return { error: 'Address must contain 0x followed by 40 hexadecimal characters' }
  if (typeof role !== 'string' || !ADDRESS_ROLES.includes(role as AddressRole)) return { error: 'System address role is invalid' }
  if (role === 'MARKETPLACE' && !version) return { error: 'Version is required for a marketplace address' }
  if (workspaceId === undefined) return { error: 'Workspace is invalid' }
  if (typeof active !== 'boolean') return { error: 'Active must be a boolean' }
  return { data: { name, address, normalizedAddress: normalizeAddress(address), role: role as AddressRole, version, active, workspaceId } }
}
