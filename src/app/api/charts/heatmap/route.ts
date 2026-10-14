import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canAccessChart, canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'

export async function GET(req: NextRequest) {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const selection = parseWorkspaceSelection(new URL(req.url).searchParams.get('workspace'))
    if (selection === null || selection === 'all') return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    if (!canAccessWorkspace(admin, selection)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })

    const params = new URL(req.url).searchParams
    const token = params.get('token')?.trim()
    if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    const registeredToken = await prisma.tokenContract.findFirst({
      where: { workspaceId: selection, address: { equals: token, mode: 'insensitive' } },
      select: { standard: true },
    })
    if (!registeredToken) return NextResponse.json({ error: 'Token not found in workspace' }, { status: 404 })
    const standard = registeredToken.standard?.toUpperCase()
    const menuKey = standard === 'KAP-20' ? 'kap20-analysis' : standard === 'KAP-22' ? 'kap22-analysis' : null
    const chartKey = standard === 'KAP-20' ? 'kap20.activity-heatmap' : standard === 'KAP-22' ? 'kap22.activity-heatmap' : null
    if (!menuKey || !chartKey || !canAccessMenu(admin, menuKey) || !canAccessChart(admin, chartKey)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const scope = await getWorkspaceReportScope(selection)
    if (!(scope.tokenAddresses ?? []).some((address) => address.toLowerCase() === token.toLowerCase())) {
      return NextResponse.json({ error: 'Token not found in workspace scope' }, { status: 404 })
    }
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const validDate = (value: string): boolean => {
      if (!datePattern.test(value) || value.startsWith('0000-')) return false
      const parsed = new Date(`${value}T00:00:00.000Z`)
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }
    const from = params.get('from')
    const to = params.get('to')
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }
    const fromFilter = from
      ? Prisma.sql`AND (h."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::date >= ${from}::date`
      : Prisma.empty
    const toFilter = to
      ? Prisma.sql`AND (h."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::date <= ${to}::date`
      : Prisma.empty
    const rows = await prisma.$queryRaw<Array<{ weekday: number; hour: number; total: bigint }>>(Prisma.sql`
      WITH headers AS (
        SELECT h."txId", h."timestamp"
        FROM "TransactionHeader" h
        WHERE EXISTS (
          SELECT 1 FROM "TransactionDetail" d
          WHERE d."txId" = h."txId" AND LOWER(d."tokenAddress") = LOWER(${token})
        )
        UNION ALL
        SELECT h."txId", h."timestamp"
        FROM "RedemptionTransactionHeader" h
        WHERE EXISTS (
          SELECT 1 FROM "RedemptionTransactionDetail" d
          WHERE d."txId" = h."txId" AND LOWER(d."tokenAddress") = LOWER(${token})
        )
      )
      SELECT EXTRACT(ISODOW FROM h."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::int AS weekday,
             EXTRACT(HOUR FROM h."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::int AS hour,
             COUNT(*)::bigint AS total
      FROM headers h
      WHERE TRUE
        ${fromFilter}
        ${toFilter}
      GROUP BY weekday, hour
    `)
    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    for (const row of rows) {
      if (row.weekday >= 1 && row.weekday <= 7 && row.hour >= 0 && row.hour <= 23) {
        heatmap[row.weekday - 1][row.hour] = Number(row.total)
      }
    }
    return NextResponse.json({ heatmap })
  } catch (error) {
    console.error('Heatmap error:', error)
    return NextResponse.json({ error: 'Failed to fetch heatmap data' }, { status: 500 })
  }
}
