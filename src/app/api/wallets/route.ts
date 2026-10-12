import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import { Prisma, type Wallet } from '@prisma/client'

interface CountRow { count: bigint }

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'wallets')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20))
  const workspace = parseWorkspaceSelection(searchParams.get('workspace'))
  if (workspace === null) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  if (!canAccessWorkspace(admin, workspace)) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  const skip = (page - 1) * limit

  try {
    const scope = await getWorkspaceReportScope(workspace)
    const scopedSymbols = scope.tokenAddresses === null
      ? null
      : new Set((await prisma.tokenContract.findMany({
          where: { normalizedAddress: { in: scope.tokenAddresses } },
          select: { symbol: true },
        })).flatMap((token) => token.symbol ? [token.symbol.toUpperCase()] : []))
    let wallets: Wallet[]
    let total: number
    if (scope.tokenAddresses === null) {
      [wallets, total] = await Promise.all([
        prisma.wallet.findMany({ orderBy: { ICCYYN: 'desc' }, skip, take: limit }),
        prisma.wallet.count(),
      ])
    } else if (scope.tokenAddresses.length === 0) {
      wallets = []
      total = 0
    } else {
      const scoped = Prisma.sql`
        EXISTS (
          SELECT 1 FROM "TransactionDetail" detail
          WHERE LOWER(detail."tokenAddress") IN (${Prisma.join(scope.tokenAddresses)})
            AND (LOWER(detail."fromHash") = LOWER(wallet."walletId") OR LOWER(detail."toHash") = LOWER(wallet."walletId"))
        )
      `
      const [rows, counts] = await Promise.all([
        prisma.$queryRaw<Wallet[]>(Prisma.sql`SELECT wallet.* FROM "Wallet" wallet WHERE ${scoped} ORDER BY wallet."ICCYYN" DESC OFFSET ${skip} LIMIT ${limit}`),
        prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint count FROM "Wallet" wallet WHERE ${scoped}`),
      ])
      wallets = rows
      total = Number(counts[0]?.count ?? 0)
    }

    return NextResponse.json({
      wallets: wallets.map((w) => ({
        ...w,
        ICCYYN: scopedSymbols === null || scopedSymbols.has('ICCYYN') ? w.ICCYYN.toString() : '0',
        FIT: scopedSymbols === null || scopedSymbols.has('FIT') ? w.FIT.toString() : '0',
        TGT: scopedSymbols === null || scopedSymbols.has('TGT') ? w.TGT.toString() : '0',
        INT: scopedSymbols === null || scopedSymbols.has('INT') ? w.INT.toString() : '0',
        GRN: scopedSymbols === null || scopedSymbols.has('GRN') ? w.GRN.toString() : '0',
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Wallets error:', error)
    return NextResponse.json({ error: 'Failed to fetch wallets' }, { status: 500 })
  }
}
