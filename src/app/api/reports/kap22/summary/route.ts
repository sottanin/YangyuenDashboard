import { NextRequest, NextResponse } from 'next/server'
import { getKap22Summary } from '@/lib/reporting/kap22Analysis'
import { normalizeAddress, isValidAddress } from '@/lib/system/addresses'
import { parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap22-analysis')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const token = request.nextUrl.searchParams.get('token')?.trim() ?? ''
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  if (!isValidAddress(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  try {
    const summary = await getKap22Summary(normalizeAddress(token), workspace)
    if (!summary) return NextResponse.json({ error: 'Token is not active in the selected scope' }, { status: 400 })
    return NextResponse.json(summary)
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('KAP-22 summary error:', error)
    return NextResponse.json({ error: 'Failed to load KAP-22 summary' }, { status: 500 })
  }
}
