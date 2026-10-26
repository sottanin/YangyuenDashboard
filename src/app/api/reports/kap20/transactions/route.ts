import { parseReportDateRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getKap20Transactions } from '@/lib/reporting/kap20Analysis'
import { parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
  const admin = await getCurrentAdmin(); if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'kap20-analysis') || !canAccessChart(admin, 'kap20.transaction-history')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const params = request.nextUrl.searchParams; const workspace = parseWorkspaceSelection(params.get('workspace')); const token = params.get('token'); const page = Math.max(1, Number(params.get('page')) || 1); const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 20)); const search = (params.get('search') ?? '').trim().slice(0, 128)
  if (workspace === null || !token) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 }); if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const range = await parseReportDateRange(request.nextUrl.searchParams)
    const data = await getKap20Transactions(token, workspace, page, limit, search, range); return data ? NextResponse.json({ ...data, page, limit }) : NextResponse.json({ error: 'Token not found' }, { status: 404 })
  } catch (error) { if (error instanceof ReportPeriodError) return NextResponse.json({ error: error.message }, { status: 400 }); console.error('Token report error:', error instanceof Error ? error.message : 'unknown'); return NextResponse.json({ error: 'Unable to load token report' }, { status: 500 }) }
}
