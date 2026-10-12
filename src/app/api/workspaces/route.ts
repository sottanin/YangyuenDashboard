import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeSystemMutation } from '@/lib/system/authorization'
import { allowedWorkspaceIds, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET() {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const workspaceIds = allowedWorkspaceIds(admin)
  const workspaces = await prisma.workspace.findMany({
    where: workspaceIds === null ? undefined : { id: { in: workspaceIds } },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { tokenContracts: true, addressContracts: true } },
    },
  })
  return NextResponse.json(workspaces)
}

export async function POST(req: NextRequest) {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change workspaces' }, { status: authorization === 'unauthorized' ? 401 : 403 })
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
  if (name.trim().toUpperCase() === 'SYSTEM') return NextResponse.json({ error: 'SYSTEM is a reserved workspace name' }, { status: 409 })
  try {
    const workspace = await prisma.workspace.create({
      data: { name: name.trim(), description: typeof description === 'string' ? description.trim() || null : null },
    })
    return NextResponse.json(workspace, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Workspace name already exists' }, { status: 409 })
  }
}
