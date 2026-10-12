import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeSystemMutation } from '@/lib/system/authorization'
import { parseTokenRegistryInput } from '@/lib/system/registry'
import { isUniqueConstraintError } from '@/lib/system/databaseErrors'
import { isTokenAddressUsed } from '@/lib/system/registryHistory'

interface RouteContext { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change the contract registry' }, { status: authorization === 'unauthorized' ? 401 : 403 })
  const { id } = await params
  try {
    const current = await prisma.tokenContract.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    const parsed = parseTokenRegistryInput(await req.json())
    if (!parsed.data) return NextResponse.json({ error: parsed.error ?? 'Invalid token' }, { status: 400 })
    const data = parsed.data
    if (current.normalizedAddress !== data.normalizedAddress && await isTokenAddressUsed(current.normalizedAddress)) {
      return NextResponse.json({ error: 'This token address is already referenced by transaction history. Keep the address and edit its metadata, classification, workspace, or status instead; create a new effective registry record for a replacement contract.' }, { status: 409 })
    }
    const duplicate = await prisma.tokenContract.findFirst({ where: { normalizedAddress: data.normalizedAddress, id: { not: id } } })
    if (duplicate) return NextResponse.json({ error: 'A token with this address already exists' }, { status: 409 })
    if (data.workspaceId && !await prisma.workspace.findUnique({ where: { id: data.workspaceId }, select: { id: true } })) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 })
    }
    return NextResponse.json(await prisma.tokenContract.update({ where: { id }, data, include: { workspace: { select: { id: true, name: true } } } }))
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    if (isUniqueConstraintError(error)) return NextResponse.json({ error: 'A token with this name or address already exists' }, { status: 409 })
    console.error('Token registry PUT error:', error)
    return NextResponse.json({ error: 'Failed to update token registry record' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change the contract registry' }, { status: authorization === 'unauthorized' ? 401 : 403 })
  const { id } = await params
  const record = await prisma.tokenContract.findUnique({ where: { id }, include: { workspace: { select: { name: true } } } })
  if (!record) return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  if (record.workspace.name === 'SYSTEM' || await isTokenAddressUsed(record.normalizedAddress)) {
    const updated = await prisma.tokenContract.update({ where: { id }, data: { active: false, effectiveTo: new Date() } })
    return NextResponse.json({ success: true, deactivated: true, record: updated })
  }
  await prisma.tokenContract.delete({ where: { id } })
  return NextResponse.json({ success: true, deactivated: false })
}
