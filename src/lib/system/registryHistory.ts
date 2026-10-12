import { prisma } from '@/lib/prisma'

export async function isTokenAddressUsed(normalizedAddress: string): Promise<boolean> {
  const [transactions, redemptions] = await Promise.all([
    prisma.transactionDetail.count({ where: { tokenAddress: { equals: normalizedAddress, mode: 'insensitive' } } }),
    prisma.redemptionTransactionDetail.count({ where: { tokenAddress: { equals: normalizedAddress, mode: 'insensitive' } } }),
  ])
  return transactions > 0 || redemptions > 0
}

export async function isSystemAddressUsed(normalizedAddress: string): Promise<boolean> {
  const [transactions, redemptions] = await Promise.all([
    prisma.transactionDetail.count({ where: { OR: [{ fromHash: { equals: normalizedAddress, mode: 'insensitive' } }, { toHash: { equals: normalizedAddress, mode: 'insensitive' } }] } }),
    prisma.redemptionTransactionDetail.count({ where: { OR: [{ fromHash: { equals: normalizedAddress, mode: 'insensitive' } }, { toHash: { equals: normalizedAddress, mode: 'insensitive' } }] } }),
  ])
  return transactions > 0 || redemptions > 0
}
