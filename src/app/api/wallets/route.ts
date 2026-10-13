import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessMenu, canAccessWorkspace, getCurrentAdmin } from '@/lib/auth/admin'
import { getWorkspaceReportScope, parseWorkspaceSelection } from '@/lib/reporting/workspaceScope'
import { Prisma, type Wallet } from '@prisma/client'
import { walletBalanceFieldForTokenAddress, type WalletBalanceField } from '@/lib/walletBalances'

interface CountRow { count: bigint }
const WALLET_TOKEN_DISPLAY_ORDER: readonly WalletBalanceField[] = [
  'ICCYYN', 'GRN', 'TGT', 'INT', 'FIT', 'YYN', 'EVT', 'HLT', 'SCT', 'GVT',
]
interface VisibleToken {
  field: WalletBalanceField
  name: string
  symbol: string
  standard: string
}

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
    const scopedBalanceFields: ReadonlySet<WalletBalanceField> | null = scope.tokenAddresses === null
      ? null
      : new Set(scope.tokenAddresses.flatMap((address) => {
          const field = walletBalanceFieldForTokenAddress(address)
          return field ? [field] : []
        }))
    const registryTokens = await prisma.tokenContract.findMany({
      where: {
        active: true,
        standard: { in: ['KAP-20', 'KAP-22'] },
        ...(scope.tokenAddresses === null ? {} : { normalizedAddress: { in: scope.tokenAddresses } }),
      },
      select: { name: true, symbol: true, standard: true, normalizedAddress: true },
      orderBy: [{ standard: 'asc' }, { name: 'asc' }],
    })
    const visibleTokensByField = new Map<WalletBalanceField, VisibleToken>()
    for (const token of registryTokens) {
      const field = walletBalanceFieldForTokenAddress(token.normalizedAddress)
      if (!field || visibleTokensByField.has(field)) continue
      visibleTokensByField.set(field, {
        field,
        name: token.name,
        symbol: token.symbol ?? token.name,
        standard: token.standard ?? '',
      })
    }
    const visibleTokens = [...visibleTokensByField.values()].sort((left, right) => {
      return WALLET_TOKEN_DISPLAY_ORDER.indexOf(left.field) - WALLET_TOKEN_DISPLAY_ORDER.indexOf(right.field)
    })
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
        prisma.$queryRaw<Wallet[]>(Prisma.sql`SELECT wallet.* FROM "Wallet" wallet WHERE ${scoped} ORDER BY LOWER(wallet."walletId") ASC OFFSET ${skip} LIMIT ${limit}`),
        prisma.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*)::bigint count FROM "Wallet" wallet WHERE ${scoped}`),
      ])
      wallets = rows
      total = Number(counts[0]?.count ?? 0)
    }

    return NextResponse.json({
      wallets: wallets.map((wallet) => {
        const visible = (field: WalletBalanceField): string => (
          scopedBalanceFields === null || scopedBalanceFields.has(field)
            ? wallet[field].toString()
            : '0'
        )
        return {
          id: wallet.id,
          walletId: wallet.walletId,
          timestamp: wallet.timestamp,
          notify: wallet.notify,
          ICCYYN: visible('ICCYYN'),
          FIT: visible('FIT'),
          TGT: visible('TGT'),
          INT: visible('INT'),
          GRN: visible('GRN'),
          YYN: visible('YYN'),
          EVT: visible('EVT'),
          HLT: visible('HLT'),
          SCT: visible('SCT'),
          GVT: visible('GVT'),
        }
      }),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      visibleTokens,
    })
  } catch (error) {
    console.error('Wallets error:', error)
    return NextResponse.json({ error: 'Failed to fetch wallets' }, { status: 500 })
  }
}
