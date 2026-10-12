import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeSystemMutation } from '@/lib/system/authorization'
import { parseTokenRegistryInput } from '@/lib/system/registry'
import { isUniqueConstraintError } from '@/lib/system/databaseErrors'
import { allowedWorkspaceIds, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET(): Promise<NextResponse> {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const workspaceIds = allowedWorkspaceIds(admin)
    const tokens = await prisma.tokenContract.findMany({
      where: workspaceIds === null ? undefined : { workspaceId: { in: workspaceIds } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, address: true, normalizedAddress: true, symbol: true, standard: true,
        decimals: true, role: true, active: true, effectiveFrom: true, effectiveTo: true, workspaceId: true,
        imageKey: true, workspace: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(tokens.map(({ imageKey, ...token }) => ({ ...token, imageUrl: imageKey ? `/api/contracts/token/${token.id}/image` : null })))
  } catch (error) {
    console.error('Token registry GET error:', error)
    return NextResponse.json({ error: 'Failed to load token registry' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change the contract registry' }, { status: authorization === 'unauthorized' ? 401 : 403 })
  try {
    const parsed = parseTokenRegistryInput(await req.json())
    if (!parsed.data) return NextResponse.json({ error: parsed.error ?? 'Invalid token' }, { status: 400 })
    const data = parsed.data
    const duplicate = await prisma.tokenContract.findFirst({ where: { normalizedAddress: data.normalizedAddress } })
    if (duplicate) return NextResponse.json({ error: 'A token with this address already exists' }, { status: 409 })
    if (data.workspaceId && !await prisma.workspace.findUnique({ where: { id: data.workspaceId }, select: { id: true } })) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 })
    }
    const token = await prisma.tokenContract.create({ data, include: { workspace: { select: { id: true, name: true } } } })
    return NextResponse.json(token, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    if (isUniqueConstraintError(error)) return NextResponse.json({ error: 'A token with this name or address already exists' }, { status: 409 })
    console.error('Token registry POST error:', error)
    return NextResponse.json({ error: 'Failed to create token registry record' }, { status: 500 })
  }
}
