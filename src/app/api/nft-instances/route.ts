import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { allowedWorkspaceIds, canAccessMenu, getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

function positiveInteger(value: string | null, fallback: number, maximum?: number): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback
  return maximum ? Math.min(parsed, maximum) : parsed
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'nft-instances')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const requestedPage = positiveInteger(request.nextUrl.searchParams.get('page'), 1, 1_000_000)
  const pageSize = positiveInteger(request.nextUrl.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const search = request.nextUrl.searchParams.get('search')?.trim().slice(0, 128) ?? ''
  const protection = request.nextUrl.searchParams.get('protection') ?? 'all'
  const contract = request.nextUrl.searchParams.get('contract')?.trim().toLowerCase() ?? ''

  if (!['all', 'protected', 'replaceable'].includes(protection)) {
    return NextResponse.json({ error: 'Invalid protection filter' }, { status: 400 })
  }

  const workspaceIds = allowedWorkspaceIds(admin)

  try {
    const contracts = await prisma.tokenContract.findMany({
      where: {
        active: true,
        standard: 'KAP-721',
        ...(workspaceIds === null ? {} : { workspaceId: { in: workspaceIds } }),
      },
      orderBy: { normalizedAddress: 'asc' },
      select: { address: true, normalizedAddress: true },
    })
    const allowedAddresses = contracts.map((item) => item.normalizedAddress)
    if (contract && !allowedAddresses.includes(contract)) {
      return NextResponse.json({ error: 'NFT contract not found' }, { status: 404 })
    }

    const where: Prisma.NFTInstanceWhereInput = {
      normalizedTokenAddress: contract || { in: allowedAddresses },
      ...(protection === 'protected' ? { isNotReplace: true } : protection === 'replaceable' ? { isNotReplace: false } : {}),
      ...(search ? {
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { tokenAddress: { contains: search, mode: 'insensitive' } },
          { ownerHash: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    }
    const total = await prisma.nFTInstance.count({ where })
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(requestedPage, totalPages)
    const rows = await prisma.nFTInstance.findMany({
      where,
      orderBy: [{ normalizedTokenAddress: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        imageUrl: true,
        name: true,
        ownerHash: true,
        tokenAddress: true,
        normalizedTokenAddress: true,
        tokenValue: true,
        isNotReplace: true,
      },
    })

    return NextResponse.json({
      rows: rows.map((row) => ({ ...row, tokenValue: row.tokenValue?.toString() ?? null })),
      total,
      page,
      pageSize,
      totalPages,
      contracts: contracts.map((item) => ({ tokenAddress: item.address, normalizedTokenAddress: item.normalizedAddress })),
    })
  } catch (error) {
    console.error('NFT instance list error:', error)
    return NextResponse.json({ error: 'Unable to load NFT instances' }, { status: 500 })
  }
}
