import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeSystemMutation } from '@/lib/system/authorization'
import { normalizeAddress, SYSTEM_ADDRESSES } from '@/lib/system/addresses'
import { parseAddressRegistryInput } from '@/lib/system/registry'
import { isUniqueConstraintError } from '@/lib/system/databaseErrors'
import { allowedWorkspaceIds, canAccessMenu, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET(): Promise<NextResponse> {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAccessMenu(admin, 'contracts')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const workspaceIds = allowedWorkspaceIds(admin)
    const addresses = await prisma.addressContract.findMany({
      where: workspaceIds === null ? undefined : { workspaceId: { in: workspaceIds } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { workspace: { select: { id: true, name: true } } },
    })
    return NextResponse.json(addresses)
  } catch (error) {
    console.error('Address registry GET error:', error)
    return NextResponse.json({ error: 'Failed to load system address registry' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change the contract registry' }, { status: authorization === 'unauthorized' ? 401 : 403 })
  try {
    const parsed = parseAddressRegistryInput(await req.json())
    if (!parsed.data) return NextResponse.json({ error: parsed.error ?? 'Invalid address' }, { status: 400 })
    const data = parsed.data
    if (data.role === 'ZERO' && data.normalizedAddress !== normalizeAddress(SYSTEM_ADDRESSES.zero)) {
      return NextResponse.json({ error: 'Zero Wallet must use the canonical zero address' }, { status: 400 })
    }
    const duplicate = await prisma.addressContract.findFirst({ where: { normalizedAddress: data.normalizedAddress } })
    if (duplicate) return NextResponse.json({ error: 'A system address with this address already exists' }, { status: 409 })
    if (data.workspaceId && !await prisma.workspace.findUnique({ where: { id: data.workspaceId }, select: { id: true } })) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 })
    }
    const record = await prisma.addressContract.create({ data, include: { workspace: { select: { id: true, name: true } } } })
    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    if (isUniqueConstraintError(error)) return NextResponse.json({ error: 'A system address with this name or address already exists' }, { status: 409 })
    console.error('Address registry POST error:', error)
    return NextResponse.json({ error: 'Failed to create system address registry record' }, { status: 500 })
  }
}
