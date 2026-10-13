import { Prisma } from '@prisma/client'
import { normalizeAddress, TOKEN_ADDRESSES } from '@/lib/system/addresses'

export const WALLET_BALANCE_FIELDS = [
  'ICCYYN', 'FIT', 'TGT', 'INT', 'GRN', 'YYN', 'EVT', 'HLT', 'SCT', 'GVT',
] as const

export type WalletBalanceField = (typeof WALLET_BALANCE_FIELDS)[number]

export const WALLET_BALANCE_FIELD_BY_TOKEN_ADDRESS: Readonly<Record<string, WalletBalanceField>> = {
  [normalizeAddress(TOKEN_ADDRESSES.iccyyn)]: 'ICCYYN',
  [normalizeAddress(TOKEN_ADDRESSES.fit)]: 'FIT',
  [normalizeAddress(TOKEN_ADDRESSES.tgt)]: 'TGT',
  [normalizeAddress(TOKEN_ADDRESSES.int)]: 'INT',
  [normalizeAddress(TOKEN_ADDRESSES.grn)]: 'GRN',
  [normalizeAddress(TOKEN_ADDRESSES.yyn)]: 'YYN',
  [normalizeAddress(TOKEN_ADDRESSES.evt)]: 'EVT',
  [normalizeAddress(TOKEN_ADDRESSES.hlt)]: 'HLT',
  [normalizeAddress(TOKEN_ADDRESSES.sct)]: 'SCT',
  [normalizeAddress(TOKEN_ADDRESSES.gvt)]: 'GVT',
}

const SQL_BALANCE_COLUMNS: Readonly<Record<WalletBalanceField, Prisma.Sql>> = {
  ICCYYN: Prisma.raw('"ICCYYN"'),
  FIT: Prisma.raw('"FIT"'),
  TGT: Prisma.raw('"TGT"'),
  INT: Prisma.raw('"INT"'),
  GRN: Prisma.raw('"GRN"'),
  YYN: Prisma.raw('"YYN"'),
  EVT: Prisma.raw('"EVT"'),
  HLT: Prisma.raw('"HLT"'),
  SCT: Prisma.raw('"SCT"'),
  GVT: Prisma.raw('"GVT"'),
}

export function walletBalanceFieldForTokenAddress(address: string): WalletBalanceField | null {
  return WALLET_BALANCE_FIELD_BY_TOKEN_ADDRESS[normalizeAddress(address)] ?? null
}

export function walletBalanceColumnForTokenAddress(address: string): Prisma.Sql {
  const field = walletBalanceFieldForTokenAddress(address)
  if (!field) throw new Error('Unsupported wallet-balance token address')
  return SQL_BALANCE_COLUMNS[field]
}
