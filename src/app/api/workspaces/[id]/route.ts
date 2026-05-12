import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json() as { name?: string; description?: string }
  const { name, description } = body
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  try {
    const workspace = await prisma.workspace.update({
      where: { id: parseInt(id) },
      data: { name: name.trim(), description: description?.trim() || null },
    })
    return NextResponse.json(workspace)
  } catch {
    return NextResponse.json({ error: 'Workspace name already exists' }, { status: 409 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseInt(id)

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
