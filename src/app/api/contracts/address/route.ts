import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const addresses = await prisma.addressContract.findMany({
    orderBy: { name: 'asc' },
    include: { workspace: { select: { id: true, name: true } } },
  })
  return NextResponse.json(addresses)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; address?: string; workspaceId?: number }
  const { name, address, workspaceId } = body
  if (!name || !address) {
    return NextResponse.json({ error: 'name and address are required' }, { status: 400 })
  }

  let wsId = workspaceId ?? null
  if (!wsId) {
    const system = await prisma.workspace.findUnique({ where: { name: 'SYSTEM' } })
    wsId = system?.id ?? null
  }

  const record = await prisma.addressContract.create({ data: { name, address, workspaceId: wsId } })
  return NextResponse.json(record, { status: 201 })
}
