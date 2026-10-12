import { NextRequest, NextResponse } from 'next/server'
import { listKap22Tokens } from '@/lib/reporting/kap22Analysis'
import { parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap22-analysis')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    return NextResponse.json({ tokens: await listKap22Tokens(workspace) })
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('KAP-22 token options error:', error)
    return NextResponse.json({ error: 'Failed to load KAP-22 tokens' }, { status: 500 })
  }
}
