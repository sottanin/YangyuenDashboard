import { NextRequest, NextResponse } from 'next/server'
import { canAccessAnyChart, canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getKap20TopUsers } from '@/lib/reporting/kap20Analysis'
import { parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin(); if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap20-analysis') || !canAccessAnyChart(admin, ['kap20.top-recipients', 'kap20.top-holders'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const params = request.nextUrl.searchParams; const workspace = parseWorkspaceSelection(params.get('workspace')); const token = params.get('token')
  if (workspace === null || !token) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 }); if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const data = await getKap20TopUsers(token, workspace); if (!data) return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  return NextResponse.json({ ...data, topReceived: canAccessChart(admin, 'kap20.top-recipients') ? data.topReceived : [], topBalances: canAccessChart(admin, 'kap20.top-holders') ? data.topBalances : [] })
}
