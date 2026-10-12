import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getReportingConfig } from '@/lib/system/config'
import { normalizeAddress, SYSTEM_ADDRESSES, TOKEN_ADDRESSES } from '@/lib/system/addresses'

const REQUIRED_TOKEN_ROLES = new Map<string, string>([
  [normalizeAddress(TOKEN_ADDRESSES.iccyyn), 'PRIMARY_TOKEN'],
  [normalizeAddress(TOKEN_ADDRESSES.fit), 'POINT_TOKEN'],
  [normalizeAddress(TOKEN_ADDRESSES.grn), 'POINT_TOKEN'],
  [normalizeAddress(TOKEN_ADDRESSES.int), 'POINT_TOKEN'],
  [normalizeAddress(TOKEN_ADDRESSES.tgt), 'POINT_TOKEN'],
  [normalizeAddress(TOKEN_ADDRESSES.redemptionNft), 'REDEMPTION_NFT'],
])

const REQUIRED_ADDRESS_ROLES = new Map<string, string>([
  [normalizeAddress(SYSTEM_ADDRESSES.zero), 'ZERO'],
  [normalizeAddress(SYSTEM_ADDRESSES.initialMint), 'INITIAL_MINT'],
  [normalizeAddress(SYSTEM_ADDRESSES.main), 'MAIN'],
  [normalizeAddress(SYSTEM_ADDRESSES.workspace), 'WORKSPACE'],
  [normalizeAddress(SYSTEM_ADDRESSES.distributorPool), 'DISTRIBUTOR_POOL'],
  [normalizeAddress(SYSTEM_ADDRESSES.operationPool), 'OPERATION_POOL'],
  [normalizeAddress(SYSTEM_ADDRESSES.loyaltySwap), 'LOYALTY_SWAP'],
  [normalizeAddress(SYSTEM_ADDRESSES.marketplaceV1), 'MARKETPLACE'],
  [normalizeAddress(SYSTEM_ADDRESSES.marketplaceV2), 'MARKETPLACE'],
  [normalizeAddress(SYSTEM_ADDRESSES.marketplaceFee), 'MARKETPLACE_FEE'],
])

export async function GET(): Promise<NextResponse> {
  try {
    const [config, activeTokens, activeAddresses, latestJobs] = await Promise.all([
      getReportingConfig(),
      prisma.tokenContract.findMany({
        where: { active: true, normalizedAddress: { in: Array.from(REQUIRED_TOKEN_ROLES.keys()) } },
        select: { normalizedAddress: true, role: true, workspace: { select: { name: true } } },
      }),
      prisma.addressContract.findMany({
        where: { active: true, normalizedAddress: { in: Array.from(REQUIRED_ADDRESS_ROLES.keys()) } },
        select: { normalizedAddress: true, role: true, workspace: { select: { name: true } } },
      }),
      prisma.batchJobLog.findMany({ orderBy: { startedAt: 'desc' }, take: 5, select: { id: true, status: true, tokenName: true, startedAt: true, finishedAt: true } }),
    ])
    const validTokens = activeTokens.filter((record) => REQUIRED_TOKEN_ROLES.get(record.normalizedAddress) === record.role && record.workspace?.name === 'SYSTEM')
    const validAddresses = activeAddresses.filter((record) => REQUIRED_ADDRESS_ROLES.get(record.normalizedAddress) === record.role && record.workspace?.name === 'SYSTEM')
    const tokenRegistryComplete = validTokens.length === REQUIRED_TOKEN_ROLES.size
    const addressRegistryComplete = validAddresses.length === REQUIRED_ADDRESS_ROLES.size
    const nft = await prisma.tokenContract.findFirst({
      where: { normalizedAddress: normalizeAddress(config.redemptionNftContract), active: true, role: 'REDEMPTION_NFT' },
      select: { id: true },
    })
    return NextResponse.json({
      ready: tokenRegistryComplete && addressRegistryComplete && Boolean(nft) && !Number.isNaN(Date.parse(config.businessHistoryStart)),
      checks: {
        activeTokenContracts: validTokens.length,
        requiredTokenContracts: REQUIRED_TOKEN_ROLES.size,
        tokenRegistryComplete,
        activeSystemAddresses: validAddresses.length,
        requiredSystemAddresses: REQUIRED_ADDRESS_ROLES.size,
        addressRegistryComplete,
        redemptionNftConfigured: Boolean(nft),
        businessHistoryStartConfigured: !Number.isNaN(Date.parse(config.businessHistoryStart)),
      },
      latestJobs,
    })
  } catch (error) {
    console.error('Readiness GET error:', error)
    return NextResponse.json({ error: 'Failed to assess reporting readiness' }, { status: 500 })
  }
}
