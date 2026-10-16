import { Prisma } from '@prisma/client'
import { normalizeAddress, TOKEN_ADDRESSES } from '@/lib/system/addresses'

export const WALLET_BALANCE_FIELDS = [
  'ICCYYN', 'FIT', 'TGT', 'INT', 'GRN', 'YYN', 'EVT', 'HLT', 'SCT', 'GVT',
] as const

export type WalletBalanceField = (typeof WALLET_BALANCE_FIELDS)[number]

export const WALLET_EXPIRED_BALANCE_FIELDS = [
  'FIT_EXPIRED', 'TGT_EXPIRED', 'INT_EXPIRED', 'GRN_EXPIRED', 'YYN_EXPIRED',
  'EVT_EXPIRED', 'HLT_EXPIRED', 'SCT_EXPIRED', 'GVT_EXPIRED',
] as const

export type WalletExpiredBalanceField = (typeof WALLET_EXPIRED_BALANCE_FIELDS)[number]
export type WalletSnapshotBalanceField = WalletBalanceField | WalletExpiredBalanceField

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

export const WALLET_EXPIRED_BALANCE_FIELD_BY_TOKEN_ADDRESS: Readonly<Record<string, WalletExpiredBalanceField>> = {
  [normalizeAddress(TOKEN_ADDRESSES.fit)]: 'FIT_EXPIRED',
  [normalizeAddress(TOKEN_ADDRESSES.tgt)]: 'TGT_EXPIRED',
  [normalizeAddress(TOKEN_ADDRESSES.int)]: 'INT_EXPIRED',
  [normalizeAddress(TOKEN_ADDRESSES.grn)]: 'GRN_EXPIRED',
  [normalizeAddress(TOKEN_ADDRESSES.yyn)]: 'YYN_EXPIRED',
  [normalizeAddress(TOKEN_ADDRESSES.evt)]: 'EVT_EXPIRED',
  [normalizeAddress(TOKEN_ADDRESSES.hlt)]: 'HLT_EXPIRED',
  [normalizeAddress(TOKEN_ADDRESSES.sct)]: 'SCT_EXPIRED',
  [normalizeAddress(TOKEN_ADDRESSES.gvt)]: 'GVT_EXPIRED',
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

const SQL_EXPIRED_BALANCE_COLUMNS: Readonly<Record<WalletExpiredBalanceField, Prisma.Sql>> = {
  FIT_EXPIRED: Prisma.raw('"FIT_EXPIRED"'),
  TGT_EXPIRED: Prisma.raw('"TGT_EXPIRED"'),
  INT_EXPIRED: Prisma.raw('"INT_EXPIRED"'),
  GRN_EXPIRED: Prisma.raw('"GRN_EXPIRED"'),
  YYN_EXPIRED: Prisma.raw('"YYN_EXPIRED"'),
  EVT_EXPIRED: Prisma.raw('"EVT_EXPIRED"'),
  HLT_EXPIRED: Prisma.raw('"HLT_EXPIRED"'),
  SCT_EXPIRED: Prisma.raw('"SCT_EXPIRED"'),
  GVT_EXPIRED: Prisma.raw('"GVT_EXPIRED"'),
}

export function walletBalanceFieldForTokenAddress(address: string): WalletBalanceField | null {
  return WALLET_BALANCE_FIELD_BY_TOKEN_ADDRESS[normalizeAddress(address)] ?? null
}

export function walletBalanceColumnForTokenAddress(address: string): Prisma.Sql {
  const field = walletBalanceFieldForTokenAddress(address)
  if (!field) throw new Error('Unsupported wallet-balance token address')
  return SQL_BALANCE_COLUMNS[field]
}

export function walletExpiredBalanceFieldForTokenAddress(address: string): WalletExpiredBalanceField | null {
  return WALLET_EXPIRED_BALANCE_FIELD_BY_TOKEN_ADDRESS[normalizeAddress(address)] ?? null
}

export function walletExpiredBalanceColumnForTokenAddress(address: string): Prisma.Sql {
  const field = walletExpiredBalanceFieldForTokenAddress(address)
  if (!field) throw new Error('Unsupported expired wallet-balance token address')
  return SQL_EXPIRED_BALANCE_COLUMNS[field]
}
