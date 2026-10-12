import { NextRequest, NextResponse } from 'next/server'
import { getKap22Transactions } from '@/lib/reporting/kap22Analysis'
import { normalizeAddress, isValidAddress } from '@/lib/system/addresses'
import { parseWorkspaceSelection, WorkspaceNotFoundError } from '@/lib/reporting/workspaceScope'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'

function boundedInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap22-analysis')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const token = request.nextUrl.searchParams.get('token')?.trim() ?? ''
  const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace'))
  // Bound offset pagination so an authenticated request cannot force PostgreSQL
  // to walk an effectively unbounded number of rows.
  const page = boundedInteger(request.nextUrl.searchParams.get('page'), 1, 10_000)
  const limit = boundedInteger(request.nextUrl.searchParams.get('limit'), 20, 100)
  const search = request.nextUrl.searchParams.get('search')?.trim() ?? ''
  if (!isValidAddress(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  if (page === null || limit === null) return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 })
  if (search.length === 1) return NextResponse.json({ error: 'Search must contain at least 2 characters' }, { status: 400 })
  if (search.length > 128) return NextResponse.json({ error: 'Search is too long' }, { status: 400 })
  // Transaction IDs and wallet addresses are hexadecimal. Keeping partial
  // searches to that alphabet prevents LIKE wildcard input from turning a
  // targeted lookup into an unnecessarily broad authenticated table scan.
  if (search && !/^(?:0x)?[0-9a-f]+$/i.test(search)) {
    return NextResponse.json({ error: 'Search must be a transaction ID or wallet address' }, { status: 400 })
  }
  try {
    const result = await getKap22Transactions(normalizeAddress(token), workspace, page, limit, search)
    if (!result) return NextResponse.json({ error: 'Token is not active in the selected scope' }, { status: 400 })
    return NextResponse.json({ ...result, page, limit })
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error('KAP-22 transactions error:', error)
    return NextResponse.json({ error: 'Failed to load KAP-22 transactions' }, { status: 500 })
  }
}
