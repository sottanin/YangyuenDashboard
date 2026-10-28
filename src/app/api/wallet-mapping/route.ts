import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { CANONICAL_NORMALIZED_ADDRESSES } from '@/lib/system/addresses'
import { getWorkspaceReportScope } from '@/lib/reporting/workspaceScope'
import { prisma } from '@/lib/prisma'
import { authorizeSystemMutation } from '@/lib/system/authorization'
import { parseWalletMappingWorkbook } from '@/lib/walletMappingImport'

export const runtime = 'nodejs'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const PAGE_SIZE = 100

function workspaceIdFrom(value: FormDataEntryValue | string | null): number | null {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

async function authorizeRead(workspaceId: number): Promise<NextResponse | null> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'wallet-mapping')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!canAccessWorkspace(admin, workspaceId)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, NOT: { name: { equals: 'SYSTEM', mode: 'insensitive' } } }, select: { id: true } })
  return workspace ? null : NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const workspaceId = workspaceIdFrom(request.nextUrl.searchParams.get('workspace'))
  if (workspaceId === null) return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
  const denied = await authorizeRead(workspaceId)
  if (denied) return denied
  const mode = request.nextUrl.searchParams.get('mode') ?? 'mapped'
  if (!['mapped', 'unmapped-wallet', 'unmapped-user'].includes(mode)) return NextResponse.json({ error: 'Invalid mapping status' }, { status: 400 })
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(request.nextUrl.searchParams.get('page') ?? 1)) || 1))
  const search = (request.nextUrl.searchParams.get('search') ?? '').trim().toLowerCase().slice(0, 200)
  if (mode !== 'mapped') {
    const scope = await getWorkspaceReportScope(workspaceId)
    const tokens = scope.tokenAddresses ?? []
    const tokenList = tokens.length ? Prisma.join(tokens) : Prisma.sql`NULL`
    // Source identities are scoped before the anti-join. Never use the global Wallet table.
    const source = mode === 'unmapped-user'
      ? Prisma.sql`SELECT "userId" AS identity FROM "FitivityData" WHERE "workspaceId" = ${workspaceId}`
      : Prisma.sql`
        SELECT "fromHash" AS identity FROM "TransactionDetail" WHERE lower("tokenAddress") IN (${tokenList})
        UNION ALL SELECT "toHash" FROM "TransactionDetail" WHERE lower("tokenAddress") IN (${tokenList})
        UNION ALL SELECT "fromHash" FROM "RedemptionTransactionDetail" WHERE lower("tokenAddress") IN (${tokenList})
        UNION ALL SELECT "toHash" FROM "RedemptionTransactionDetail" WHERE lower("tokenAddress") IN (${tokenList})`
    const mappedColumn = mode === 'unmapped-user' ? Prisma.sql`m."normalizedUserId"` : Prisma.sql`m."normalizedWalletAddress"`
    const walletExclusions = mode === 'unmapped-wallet' ? Prisma.sql`
      AND lower(trim(identity)) ~ '^0x[0-9a-f]{40}$'
      AND lower(trim(identity)) NOT IN (${Prisma.join([...CANONICAL_NORMALIZED_ADDRESSES])})
      AND NOT EXISTS (SELECT 1 FROM "TokenContract" t WHERE t."normalizedAddress" = lower(trim(identity)))
      AND NOT EXISTS (SELECT 1 FROM "AddressContract" a WHERE (a."workspaceId" = ${workspaceId} OR a."workspaceId" IS NULL) AND a.role <> 'OTHER' AND a."normalizedAddress" = lower(trim(identity)))` : Prisma.empty
    const cte = Prisma.sql`WITH source AS (${source}), identities AS (
      SELECT lower(trim(identity)) AS normalized, min(identity) AS original FROM source
      WHERE trim(identity) <> '' ${walletExclusions}
      AND NOT EXISTS (SELECT 1 FROM "WalletMapping" m WHERE m."workspaceId" = ${workspaceId} AND ${mappedColumn} = lower(trim(identity)))
      GROUP BY lower(trim(identity))
    ), filtered AS (SELECT * FROM identities WHERE position(${search} IN normalized) > 0)`
    const counts = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`${cte} SELECT count(*) AS total FROM filtered`)
    const total = Number(counts[0]?.total ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const resolvedPage = Math.min(page, totalPages)
    const identities = await prisma.$queryRaw<{ normalized: string; original: string }[]>(Prisma.sql`${cte} SELECT normalized, original FROM filtered ORDER BY normalized OFFSET ${(resolvedPage - 1) * PAGE_SIZE} LIMIT ${PAGE_SIZE}`)
    const rows = identities.map((row) => ({ id: `${mode}:${row.normalized}`, userId: mode === 'unmapped-user' ? row.original : '', walletAddress: mode === 'unmapped-wallet' ? row.original : '' }))
    return NextResponse.json({ rows, pagination: { page: resolvedPage, pageSize: PAGE_SIZE, total, totalPages } })
  }
  const where: Prisma.WalletMappingWhereInput = {
    workspaceId,
    ...(search ? { OR: [{ normalizedUserId: { contains: search } }, { normalizedWalletAddress: { contains: search } }] } : {}),
  }
  const total = await prisma.walletMapping.count({ where })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const resolvedPage = Math.min(page, totalPages)
  const rows = await prisma.walletMapping.findMany({
    where,
    orderBy: [{ normalizedUserId: 'asc' }, { normalizedWalletAddress: 'asc' }],
    skip: (resolvedPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  })
  return NextResponse.json({ rows, pagination: { page: resolvedPage, pageSize: PAGE_SIZE, total, totalPages } })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can import Wallet Mapping data' }, { status: authorization === 'unauthorized' ? 401 : 403 })
  try {
    const form = await request.formData()
    const workspaceId = workspaceIdFrom(form.get('workspace'))
    const file = form.get('file')
    const action = form.get('action')
    const overwrite = form.get('overwrite') === 'true'
    if (workspaceId === null) return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    const denied = await authorizeRead(workspaceId)
    if (denied) return denied
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Select an Excel file' }, { status: 400 })
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'The Excel file must not exceed 10 MB' }, { status: 413 })
    if (!file.name.toLowerCase().endsWith('.xlsx')) return NextResponse.json({ error: 'Only .xlsx files are supported' }, { status: 400 })
    if (action !== 'validate' && action !== 'import') return NextResponse.json({ error: 'Invalid Wallet Mapping action' }, { status: 400 })

    const rows = await parseWalletMappingWorkbook(Buffer.from(await file.arrayBuffer()))
    const existing = await prisma.walletMapping.findMany({
      where: { workspaceId, OR: rows.map((row) => ({ normalizedUserId: row.normalizedUserId, normalizedWalletAddress: row.normalizedWalletAddress })) },
      select: { normalizedUserId: true, normalizedWalletAddress: true },
    })
    const existingKeys = new Set(existing.map((row) => `${row.normalizedUserId}\u0000${row.normalizedWalletAddress}`))
    const preview = rows.slice(0, PAGE_SIZE).map((row) => ({ ...row, status: existingKeys.has(`${row.normalizedUserId}\u0000${row.normalizedWalletAddress}`) ? 'Duplicate' : 'New' }))
    const duplicateRecords = existingKeys.size
    const newRecords = rows.length - duplicateRecords
    if (action === 'validate') return NextResponse.json({ totalRecords: rows.length, newRecords, duplicateRecords, rows: preview })
    if (duplicateRecords > 0 && !overwrite) return NextResponse.json({ error: 'Duplicate mappings require overwrite confirmation', totalRecords: rows.length, newRecords, duplicateRecords, rows: preview }, { status: 409 })

    await prisma.$transaction(async (transaction) => {
      if (overwrite) {
        for (let index = 0; index < rows.length; index += 500) {
          const batch = rows.slice(index, index + 500)
          await transaction.walletMapping.deleteMany({ where: { workspaceId, OR: batch.map((row) => ({ normalizedUserId: row.normalizedUserId, normalizedWalletAddress: row.normalizedWalletAddress })) } })
        }
      }
      for (let index = 0; index < rows.length; index += 1_000) {
        const batch = rows.slice(index, index + 1_000)
        await transaction.walletMapping.createMany({ data: batch.map((row) => ({ workspaceId, userId: row.userId, normalizedUserId: row.normalizedUserId, walletAddress: row.walletAddress, normalizedWalletAddress: row.normalizedWalletAddress })) })
      }
    }, { timeout: 30_000 })
    return NextResponse.json({ totalRecords: rows.length, importedRecords: newRecords, overwrittenRecords: overwrite ? duplicateRecords : 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process Wallet Mapping data'
    const safeMessage = /^(Row |The workbook|Columns |The Excel|Only |Duplicate |Invalid |Select )/.test(message) ? message : 'Unable to process Wallet Mapping data'
    console.error('Wallet Mapping import failed')
    return NextResponse.json({ error: safeMessage }, { status: 400 })
  }
}
