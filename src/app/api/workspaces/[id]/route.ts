import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeSystemMutation } from '@/lib/system/authorization'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change workspaces' }, { status: authorization === 'unauthorized' ? 401 : 403 })
  const { id } = await params
  const numId = Number.parseInt(id, 10)
  if (!Number.isInteger(numId) || numId <= 0) return NextResponse.json({ error: 'Invalid workspace id' }, { status: 400 })
  let body: { name?: unknown; description?: unknown }
  try {
    body = await req.json() as { name?: unknown; description?: unknown }
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }
  const { name, description } = body
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || (description !== undefined && (typeof description !== 'string' || description.length > 1000))) {
    return NextResponse.json({ error: 'Name is required (maximum 100 characters); description maximum is 1000 characters' }, { status: 400 })
  }
  try {
    const existing = await prisma.workspace.findUnique({ where: { id: numId }, select: { name: true } })
    if (!existing) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    if (existing.name === 'SYSTEM' && name.trim() !== 'SYSTEM') {
      return NextResponse.json({ error: 'The SYSTEM workspace cannot be renamed' }, { status: 409 })
    }
    if (existing.name !== 'SYSTEM' && name.trim().toUpperCase() === 'SYSTEM') {
      return NextResponse.json({ error: 'SYSTEM is a reserved workspace name' }, { status: 409 })
    }
    const workspace = await prisma.workspace.update({
      where: { id: numId },
      data: { name: name.trim(), description: typeof description === 'string' ? description.trim() || null : null },
    })
    return NextResponse.json(workspace)
  } catch {
    return NextResponse.json({ error: 'Workspace name already exists' }, { status: 409 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change workspaces' }, { status: authorization === 'unauthorized' ? 401 : 403 })
  const { id } = await params
  const numId = Number.parseInt(id, 10)
  if (!Number.isInteger(numId) || numId <= 0) return NextResponse.json({ error: 'Invalid workspace id' }, { status: 400 })

  const workspace = await prisma.workspace.findUnique({
    where: { id: numId },
    include: { _count: { select: { tokenContracts: true, addressContracts: true } } },
  })

  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }
  if (workspace.name === 'SYSTEM') {
    return NextResponse.json({ error: 'Cannot delete the SYSTEM workspace' }, { status: 409 })
  }
  if (workspace._count.tokenContracts > 0 || workspace._count.addressContracts > 0) {
    return NextResponse.json(
      { error: `Cannot delete: workspace has ${workspace._count.tokenContracts} token contract(s) and ${workspace._count.addressContracts} address contract(s) linked` },
      { status: 409 },
    )
  }

  await prisma.workspace.delete({ where: { id: numId } })
  return NextResponse.json({ success: true })
}
