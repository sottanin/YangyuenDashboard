import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const workspaces = await prisma.workspace.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { tokenContracts: true, addressContracts: true } },
    },
  })
  return NextResponse.json(workspaces)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; description?: string }
  const { name, description } = body
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  try {
    const workspace = await prisma.workspace.create({
      data: { name: name.trim(), description: description?.trim() || null },
    })
    return NextResponse.json(workspace, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Workspace name already exists' }, { status: 409 })
  }
}
