import { normalizeAddress, SYSTEM_ADDRESSES, TOKEN_ADDRESSES } from '@/lib/system/addresses'

export const FLOW_CLASSIFIER_VERSION = '2026-10-09.v1' as const

export type FlowClassification =
  | 'INITIAL_MINT'
  | 'INITIAL_SUPPLY_TO_MAIN'
  | 'POINT_FUNDING'
  | 'POINT_LOCK'
  | 'POINT_MINT_TO_POOL'
  | 'POINT_DISTRIBUTION'
  | 'SWAP_POINT_DEPOSIT'
  | 'SWAP_COLLATERAL_RELEASE'
  | 'SWAP_ICCYYN_PAYOUT'
  | 'SWAP_POINT_BURN'
  | 'MARKETPLACE_PAYMENT'
  | 'MARKETPLACE_FEE'
  | 'NFT_MINT'
  | 'NFT_USE_BURN'
  | 'UNCLASSIFIED'

export interface FlowEvent {
  tokenAddress: string
  fromHash: string
  toHash: string
  tokenStandard?: string | null
}

const addresses = Object.fromEntries(Object.entries(SYSTEM_ADDRESSES).map(([key, value]) => [key, normalizeAddress(value)])) as Record<keyof typeof SYSTEM_ADDRESSES, string>
const tokens = Object.fromEntries(Object.entries(TOKEN_ADDRESSES).map(([key, value]) => [key, normalizeAddress(value)])) as Record<keyof typeof TOKEN_ADDRESSES, string>
const pointTokens = new Set([tokens.fit, tokens.grn, tokens.int, tokens.tgt])
const pointContracts = pointTokens
const pools = new Set([addresses.distributorPool, addresses.operationPool])
const marketplaces = new Set([addresses.marketplaceV1, addresses.marketplaceV2])

export function classifyFlow(event: FlowEvent): FlowClassification {
  const token = normalizeAddress(event.tokenAddress)
  const from = normalizeAddress(event.fromHash)
  const to = normalizeAddress(event.toHash)
  const isPoint = pointTokens.has(token)
  const isNft = token === tokens.redemptionNft

  if (token === tokens.iccyyn && from === addresses.zero && to === addresses.initialMint) return 'INITIAL_MINT'
  if (token === tokens.iccyyn && from === addresses.initialMint && to === addresses.main) return 'INITIAL_SUPPLY_TO_MAIN'
  if (token === tokens.iccyyn && from === addresses.main && to === addresses.workspace) return 'POINT_FUNDING'
  if (token === tokens.iccyyn && from === addresses.workspace && pointContracts.has(to)) return 'POINT_LOCK'
  if (isPoint && from === addresses.zero && pools.has(to)) return 'POINT_MINT_TO_POOL'
  if (isPoint && pools.has(from) && to !== addresses.zero) return 'POINT_DISTRIBUTION'
  if (isPoint && from !== addresses.zero && to === addresses.loyaltySwap) return 'SWAP_POINT_DEPOSIT'
  if (token === tokens.iccyyn && pointContracts.has(from) && to === addresses.loyaltySwap) return 'SWAP_COLLATERAL_RELEASE'
  if (token === tokens.iccyyn && from === addresses.loyaltySwap && to !== addresses.zero) return 'SWAP_ICCYYN_PAYOUT'
  if (isPoint && to === addresses.zero) return 'SWAP_POINT_BURN'
  if (token === tokens.iccyyn && marketplaces.has(to)) return 'MARKETPLACE_PAYMENT'
  if (token === tokens.iccyyn && marketplaces.has(from) && to === addresses.marketplaceFee) return 'MARKETPLACE_FEE'
  if (isNft && from === addresses.zero && to !== addresses.zero) return 'NFT_MINT'
  if (isNft && from !== addresses.zero && to === addresses.zero) return 'NFT_USE_BURN'
  return 'UNCLASSIFIED'
}
