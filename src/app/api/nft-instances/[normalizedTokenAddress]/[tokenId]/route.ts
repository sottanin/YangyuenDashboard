import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { allowedWorkspaceIds, canAccessMenu, getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'

interface UpdateBody {
  imageUrl?: unknown
  name?: unknown
  tokenValue?: unknown
  isNotReplace?: unknown
}

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/
const ALLOWED_IMAGE_HOSTS = new Set(['bitkubipfs.io', 'ipfs.io'])

function parseTokenValue(value: unknown): Prisma.Decimal | null | undefined {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) return undefined
  const [whole, fraction = ''] = value.split('.')
  const significantWhole = whole.replace(/^0+(?=\d)/, '')
  if (significantWhole.length > 35 || fraction.length > 30) return undefined
  return new Prisma.Decimal(value)
}

function parseImageUrl(value: unknown): string | null | undefined {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 2048) return undefined
  const trimmed = value.trim()
  const ipfsMatch = trimmed.match(/^ipfs:\/\/(?:ipfs\/)?(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})(\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/i)
  if (ipfsMatch) {
    try {
      const safePath = (ipfsMatch[2] ?? '').split('/').every((segment) => {
        if (!segment) return true
        const decoded = decodeURIComponent(segment)
        return decoded !== '.' && decoded !== '..' && !decoded.includes('/') && !decoded.includes('\\')
      })
      if (!safePath) return undefined
      return `ipfs://${ipfsMatch[1]}${ipfsMatch[2] ?? ''}${ipfsMatch[3] ?? ''}`
    } catch {
      return undefined
    }
  }
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase()) ? trimmed : undefined
  } catch {
    return undefined
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ normalizedTokenAddress: string; tokenId: string }> },
): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'nft-instances')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { normalizedTokenAddress, tokenId } = await params
  const normalizedAddress = normalizedTokenAddress.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(normalizedAddress) || tokenId.length === 0 || tokenId.length > 256) {
    return NextResponse.json({ error: 'Invalid NFT instance identity' }, { status: 400 })
  }

  try {
    const workspaceIds = allowedWorkspaceIds(admin)
    const authorizedContract = await prisma.tokenContract.findFirst({
      where: {
        normalizedAddress,
        active: true,
        standard: 'KAP-721',
        ...(workspaceIds === null ? {} : { workspaceId: { in: workspaceIds } }),
      },
      select: { id: true },
    })
    if (!authorizedContract) return NextResponse.json({ error: 'NFT instance not found' }, { status: 404 })

    const rawBody: unknown = await request.json()
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 })
    }
    const body = rawBody as UpdateBody
    const allowedKeys = new Set(['imageUrl', 'name', 'tokenValue', 'isNotReplace'])
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      return NextResponse.json({ error: 'Only image URL, name, token value, and replacement protection can be changed' }, { status: 400 })
    }
    if (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.trim().length > 255) {
      return NextResponse.json({ error: 'Name is required and must be 255 characters or fewer' }, { status: 400 })
    }
    if (typeof body.isNotReplace !== 'boolean') {
      return NextResponse.json({ error: 'Replacement protection must be true or false' }, { status: 400 })
    }
    const imageUrl = parseImageUrl(body.imageUrl)
    if (imageUrl === undefined) {
      return NextResponse.json({ error: 'Image URL must be a valid ipfs:// URL or use HTTPS on bitkubipfs.io or ipfs.io' }, { status: 400 })
    }
    const tokenValue = parseTokenValue(body.tokenValue)
    if (tokenValue === undefined) {
      return NextResponse.json({ error: 'Token value must be a non-negative decimal with up to 35 integer digits and 30 decimal places' }, { status: 400 })
    }

    const updated = await prisma.nFTInstance.update({
      where: { normalizedTokenAddress_id: { normalizedTokenAddress: normalizedAddress, id: tokenId } },
      data: { imageUrl, name: body.name.trim(), tokenValue, isNotReplace: body.isNotReplace },
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
    return NextResponse.json({ ...updated, tokenValue: updated.tokenValue?.toString() ?? null })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'NFT instance not found' }, { status: 404 })
    }
    console.error('NFT instance update error:', error)
    return NextResponse.json({ error: 'Unable to update NFT instance' }, { status: 500 })
  }
}
