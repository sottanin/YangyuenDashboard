import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdmin, canAccessMenu, canAccessWorkspace } from '@/lib/auth/admin'
import { listKap20Tokens } from '@/lib/reporting/kap20Analysis'
import { parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
export async function GET(request: NextRequest): Promise<NextResponse> { const admin = await getCurrentAdmin(); if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); if (!canAccessMenu(admin, 'kap20-analysis')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); const workspace = parseWorkspaceSelection(request.nextUrl.searchParams.get('workspace')); if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 }); if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 }); return NextResponse.json({ tokens: await listKap20Tokens(workspace) }) }
