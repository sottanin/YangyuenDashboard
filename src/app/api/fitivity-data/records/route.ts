import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { authorizeSystemMutation } from '@/lib/system/authorization'

const METRIC_TYPES = new Set(['steps', 'sleep_awake', 'sleep_deep', 'sleep_light', 'sleep_rem', 'active_energy_burned'])
const DECIMAL_PATTERN = /^\d+(?:\.\d{1,12})?$/

async function authorize(): Promise<NextResponse | null> {
  const result = await authorizeSystemMutation()
  if (result === 'allowed') return null
  return NextResponse.json({ error: result === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can edit Fitivity data' }, { status: result === 'unauthorized' ? 401 : 403 })
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function serialize(row: {
  id: string; userId: string; metricType: string; totalValue: Prisma.Decimal; count: number; unit: string
  date: Date; window: string; isCal: boolean; updatedAt: Date; workspace: { id: number; name: string }
}) {
  return { ...row, totalValue: row.totalValue.toString(), date: row.date.toISOString().slice(0, 10), updatedAt: row.updatedAt.toISOString() }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await authorize()
  if (denied) return denied
  const body = await request.json().catch(() => null) as { identifier?: unknown; userId?: unknown; metricType?: unknown; dateFrom?: unknown; dateTo?: unknown; date?: unknown } | null
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : typeof body?.userId === 'string' ? body.userId.trim() : ''
  const metricType = typeof body?.metricType === 'string' ? body.metricType : ''
  const dateFrom = typeof body?.dateFrom === 'string' ? body.dateFrom : typeof body?.date === 'string' ? body.date : ''
  const dateTo = typeof body?.dateTo === 'string' ? body.dateTo : dateFrom
  if (!identifier || identifier.length > 200 || !METRIC_TYPES.has(metricType) || !validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
    return NextResponse.json({ error: 'User ID or Wallet Address, Metric Type, and a valid From / To date range are required' }, { status: 400 })
  }
  const isWallet = /^0x[0-9a-f]{40}$/i.test(identifier)
  const mappings = isWallet ? await prisma.walletMapping.findMany({
    where: { normalizedWalletAddress: identifier.toLowerCase() },
    select: { workspaceId: true, normalizedUserId: true },
  }) : []
  // Keep each wallet mapping paired with its workspace; user IDs can repeat across workspaces.
  const identities: Prisma.FitivityDataWhereInput[] = [{ userId: { equals: identifier, mode: 'insensitive' } }, ...mappings.map((mapping) => ({ workspaceId: mapping.workspaceId, userId: { equals: mapping.normalizedUserId, mode: 'insensitive' as const } }))]
  const rows = await prisma.fitivityData.findMany({
    where: { OR: identities, metricType, date: { gte: new Date(`${dateFrom}T00:00:00.000Z`), lte: new Date(`${dateTo}T00:00:00.000Z`) } },
    select: { id: true, userId: true, metricType: true, totalValue: true, count: true, unit: true, date: true, window: true, isCal: true, updatedAt: true, workspace: { select: { id: true, name: true } } },
    orderBy: [{ date: 'asc' }, { workspace: { name: 'asc' } }, { userId: 'asc' }, { id: 'asc' }],
    take: 1001,
  })
  if (rows.length > 1000) return NextResponse.json({ error: 'More than 1,000 records match. Narrow the date range and search again.' }, { status: 422 })
  return NextResponse.json({ rows: rows.map(serialize) })
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await authorize()
  if (denied) return denied
  const body = await request.json().catch(() => null) as { id?: unknown; totalValue?: unknown; isCal?: unknown; updatedAt?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  const totalValue = typeof body?.totalValue === 'string' ? body.totalValue.trim() : ''
  const updatedAt = typeof body?.updatedAt === 'string' ? new Date(body.updatedAt) : new Date(Number.NaN)
  if (!id || id.length > 200 || typeof body?.isCal !== 'boolean' || !DECIMAL_PATTERN.test(totalValue) || totalValue.split('.')[0].replace(/^0+(?=\d)/, '').length > 18 || Number.isNaN(updatedAt.getTime())) {
    return NextResponse.json({ error: 'Total Value must be a non-negative number with up to 18 integer and 12 decimal digits' }, { status: 400 })
  }
  const result = await prisma.fitivityData.updateMany({ where: { id, updatedAt }, data: { totalValue: new Prisma.Decimal(totalValue), isCal: body.isCal } })
  if (result.count === 0) return NextResponse.json({ error: 'This record changed after it was loaded. Search again before saving.' }, { status: 409 })
  const row = await prisma.fitivityData.findUnique({
    where: { id },
    select: { id: true, userId: true, metricType: true, totalValue: true, count: true, unit: true, date: true, window: true, isCal: true, updatedAt: true, workspace: { select: { id: true, name: true } } },
  })
  if (!row) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  return NextResponse.json({ row: serialize(row) })
}
