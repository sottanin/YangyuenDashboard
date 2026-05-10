import 'dotenv/config'
import * as XLSX from 'xlsx'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import path from 'path'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

function parseDecimal(v: unknown): Prisma.Decimal {
  if (v === null || v === undefined || v === '') return new Prisma.Decimal(0)
  const n = Number(v)
  if (isNaN(n)) return new Prisma.Decimal(0)
  return new Prisma.Decimal(n)
}

function parseDate(v: unknown): Date {
  if (!v) return new Date(0)
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0))
  }
  const parsed = new Date(String(v))
  return isNaN(parsed.getTime()) ? new Date(0) : parsed
}

function parseStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function parseInt2(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}

function parseBigInt(v: unknown): bigint | null {
  if (v === null || v === undefined || v === '') return null
  try { return BigInt(Math.round(Number(v))) } catch { return null }
}

async function runBatch<T>(promises: (Promise<T> | null)[]): Promise<void> {
  const filtered = promises.filter((p): p is Promise<T> => p !== null)
  await Promise.all(filtered)
}

async function main() {
  console.log('Starting seed...')

  // ─── Transactions.xlsx ───────────────────────────────────────────────────
  const txPath = path.join(process.cwd(), 'Transactions.xlsx')
  const txWb = XLSX.readFile(txPath, { cellDates: false })

  const txHeaders = XLSX.utils.sheet_to_json<Record<string, unknown>>(txWb.Sheets['Transaction Header'])
  const headerMap = new Map<string, Record<string, unknown>>()
  for (const h of txHeaders) {
    const id = parseStr(h['tx_id'])
    if (id) headerMap.set(id, h)
  }
  console.log(`Loaded ${headerMap.size} tx headers`)

  // Pass 1: Insert TransactionHeader (one per txId)
  console.log(`Inserting ${headerMap.size} transaction headers...`)
  const BATCH = 500
  const headerEntries = Array.from(headerMap.entries())
  for (let i = 0; i < headerEntries.length; i += BATCH) {
    const batch = headerEntries.slice(i, i + BATCH)
    const data = batch.map(([txId, hdr]) => ({
      txId,
      timestamp: parseDate(hdr['timestamp'] ?? hdr['block_timestamp']),
      txValue: parseDecimal(hdr['value']),
      fee: parseDecimal(hdr['transaction_fee']),
      block: parseBigInt(hdr['block']),
      status: parseStr(hdr['status']) || parseStr(hdr['result']) || null,
      result: parseStr(hdr['result']) || null,
      gasPrice: parseDecimal(hdr['gas_price']) || null,
      gasUsed: parseInt2(hdr['gas_used']),
    }))
    await prisma.transactionHeader.createMany({ data, skipDuplicates: true })
    process.stdout.write(`\r  Headers: ${Math.min(i + BATCH, headerEntries.length)}/${headerEntries.length}`)
  }
  console.log(`\nInserted ${headerMap.size} transaction headers`)

  // Pass 2: Upsert TransactionDetail (one per log event / key)
  const txDetails = XLSX.utils.sheet_to_json<Record<string, unknown>>(txWb.Sheets['Transaction Detail'])
  console.log(`Processing ${txDetails.length} transaction detail rows...`)

  let inserted = 0
  let skipped = 0

  for (let i = 0; i < txDetails.length; i += BATCH) {
    const batch = txDetails.slice(i, i + BATCH)
    const data: {
      key: string; txId: string; blockHash: string | null; fromHash: string; toHash: string;
      method: string; timestamp: Date; tokenAddress: string; tokenName: string; tokenSymbol: string;
      tokenType: string; decimals: number | null; value: Prisma.Decimal; txType: string; notify: string | null;
    }[] = []
    for (const row of batch) {
      const txId = parseStr(row['tx_id'])
      if (!txId || !headerMap.has(txId)) { skipped++; continue }
      const logIndex = parseStr(row['items.log_index'])
      const key = parseStr(row['key']) || (logIndex ? `${logIndex}_${txId}` : txId)
      data.push({
        key,
        txId,
        blockHash: parseStr(row['items.block_hash']) || null,
        fromHash: parseStr(row['items.from.hash']) || 'unknown',
        toHash: parseStr(row['items.to.hash']) || 'unknown',
        method: parseStr(row['items.method']) || 'unknown',
        timestamp: parseDate(row['items.timestamp']),
        tokenAddress: parseStr(row['items.token.address']) || 'unknown',
        tokenName: parseStr(row['items.token.name']) || 'unknown',
        tokenSymbol: parseStr(row['items.token.symbol']) || '',
        tokenType: parseStr(row['items.token.type']) || 'ERC-20',
        decimals: parseInt2(row['items.total.decimals']),
        value: parseDecimal(row['items.total.value']),
        txType: parseStr(row['items.type']) || 'token_transfer',
        notify: parseStr(row['items.notify']) || null,
      })
    }
    const result = await prisma.transactionDetail.createMany({ data, skipDuplicates: true })
    inserted += result.count
    process.stdout.write(`\r  Details: ${i + batch.length}/${txDetails.length}`)
  }
  console.log(`\nInserted ${inserted} transaction details (skipped ${skipped})`)

  // Wallets
  const walletSheet = txWb.Sheets['Wallet']
  if (walletSheet) {
    const wallets = XLSX.utils.sheet_to_json<Record<string, unknown>>(walletSheet)
    console.log(`Processing ${wallets.length} wallet rows...`)
    let wInserted = 0
    for (let i = 0; i < wallets.length; i += BATCH) {
      const batch = wallets.slice(i, i + BATCH)
      const ops = batch.map((row) => {
        const walletId = parseStr(row['wallet_id'])
        if (!walletId) return null
        return prisma.wallet.upsert({
          where: { walletId },
          create: {
            walletId,
            timestamp: parseDate(row['timestamp']) || null,
            notify: parseStr(row['notify']) || null,
            balanceICC: parseDecimal(row['ICC-YANGYUEN']),
            balanceGreen: parseDecimal(row['Green']),
            balanceTogether: parseDecimal(row['Together']),
            balanceIntegrity: parseDecimal(row['Integrity']),
            balanceFit: parseDecimal(row['Fit']),
          },
          update: {
            balanceICC: parseDecimal(row['ICC-YANGYUEN']),
            balanceGreen: parseDecimal(row['Green']),
            balanceTogether: parseDecimal(row['Together']),
            balanceIntegrity: parseDecimal(row['Integrity']),
            balanceFit: parseDecimal(row['Fit']),
          },
        })
      })
      await runBatch(ops)
      wInserted += ops.filter(Boolean).length
    }
    console.log(`Inserted ${wInserted} wallets`)
  }

  // Token contracts
  const tokenSheet = txWb.Sheets['Token Contract']
  if (tokenSheet) {
    const tokens = XLSX.utils.sheet_to_json<Record<string, unknown>>(tokenSheet)
    for (const t of tokens) {
      const name = parseStr(t['Token Name'])
      const address = parseStr(t['Contract Address'])
      if (!name || !address) continue
      await prisma.tokenContract.upsert({
        where: { name },
        create: { name, address },
        update: { address },
      })
    }
    console.log(`Inserted ${tokens.length} token contracts`)
  }

  // Address contracts
  const addrSheet = txWb.Sheets['Address Contract']
  if (addrSheet) {
    const addrs = XLSX.utils.sheet_to_json<Record<string, unknown>>(addrSheet)
    for (const a of addrs) {
      const name = parseStr(a['Contract Name'])
      const address = parseStr(a['Contract Address'])
      if (!name || !address) continue
      await prisma.addressContract.upsert({
        where: { name },
        create: { name, address },
        update: { address },
      })
    }
    console.log(`Inserted ${addrs.length} address contracts`)
  }

  // ─── Redemption Transactions.xlsx ───────────────────────────────────────
  const rdmPath = path.join(process.cwd(), 'Redemption Transactions.xlsx')
  const rdmWb = XLSX.readFile(rdmPath, { cellDates: false })

  const rdmHeaders = XLSX.utils.sheet_to_json<Record<string, unknown>>(rdmWb.Sheets['Transaction Header'])
  const rdmHeaderMap = new Map<string, Record<string, unknown>>()
  for (const h of rdmHeaders) {
    const id = parseStr(h['tx_id'])
    if (id) rdmHeaderMap.set(id, h)
  }
  console.log(`Loaded ${rdmHeaderMap.size} redemption headers`)

  // Pass 1: Insert RedemptionTransactionHeader (one per txId)
  console.log(`Inserting ${rdmHeaderMap.size} redemption transaction headers...`)
  const rdmHeaderEntries = Array.from(rdmHeaderMap.entries())
  for (let i = 0; i < rdmHeaderEntries.length; i += BATCH) {
    const batch = rdmHeaderEntries.slice(i, i + BATCH)
    const data = batch.map(([txId, hdr]) => ({
      txId,
      timestamp: parseDate(hdr['timestamp'] ?? hdr['block_timestamp']),
      value: parseDecimal(hdr['value']),
      fee: parseDecimal(hdr['transaction_fee']),
      block: parseBigInt(hdr['block']),
      status: parseStr(hdr['status']) || parseStr(hdr['result']) || null,
      result: parseStr(hdr['result']) || null,
      gasPrice: parseDecimal(hdr['gas_price']) || null,
      gasUsed: parseInt2(hdr['gas_used']),
    }))
    await prisma.redemptionTransactionHeader.createMany({ data, skipDuplicates: true })
    process.stdout.write(`\r  RdmHeaders: ${Math.min(i + BATCH, rdmHeaderEntries.length)}/${rdmHeaderEntries.length}`)
  }
  console.log(`\nInserted ${rdmHeaderMap.size} redemption transaction headers`)

  // Pass 2: Upsert RedemptionTransactionDetail (one per log event / key)
  const rdmDetails = XLSX.utils.sheet_to_json<Record<string, unknown>>(rdmWb.Sheets['Transaction Detail'])
  console.log(`Processing ${rdmDetails.length} redemption detail rows...`)

  let rdmInserted = 0
  let rdmSkipped = 0
  for (let i = 0; i < rdmDetails.length; i += BATCH) {
    const batch = rdmDetails.slice(i, i + BATCH)
    const ops = batch.map((row) => {
      const txId = parseStr(row['tx_id'])
      if (!txId || !rdmHeaderMap.has(txId)) { rdmSkipped++; return null }
      const logIndex = parseStr(row['items.log_index'])
      const key = parseStr(row['key']) || (logIndex ? `${logIndex}_${txId}` : txId)
      const tokenName = parseStr(row['items.token.name'])
      return prisma.redemptionTransactionDetail.upsert({
        where: { key },
        create: {
          key,
          txId,
          blockHash: parseStr(row['items.block_hash']) || null,
          fromHash: parseStr(row['items.from.hash']) || 'unknown',
          toHash: parseStr(row['items.to.hash']) || 'unknown',
          method: parseStr(row['items.method']) || 'unknown',
          timestamp: parseDate(row['items.timestamp']),
          tokenAddress: parseStr(row['items.token.address']) || 'unknown',
          tokenName: tokenName || 'unknown',
          tokenSymbol: parseStr(row['items.token.symbol']) || tokenName || '',
          tokenType: parseStr(row['items.token.type']) || 'ERC-721',
          tokenId: parseStr(row['total.token_id']) || null,
        },
        update: {},
      })
    })
    await runBatch(ops)
    rdmInserted += ops.filter(Boolean).length
    process.stdout.write(`\r  RdmDetails: ${i + batch.length}/${rdmDetails.length}`)
  }
  console.log(`\nInserted ${rdmInserted} redemption details (skipped ${rdmSkipped})`)

  // NFT Instances
  const instanceSheet = rdmWb.Sheets['Instances']
  if (instanceSheet) {
    const instances = XLSX.utils.sheet_to_json<Record<string, unknown>>(instanceSheet)
    console.log(`Processing ${instances.length} NFT instances...`)
    for (const inst of instances) {
      const id = parseStr(inst['id'])
      if (!id) continue
      await prisma.nFTInstance.upsert({
        where: { id },
        create: {
          id,
          isUnique: Boolean(inst['is_unique']),
          imageUrl: parseStr(inst['metadata.image']) || null,
          name: parseStr(inst['metadata.name']) || 'Unknown NFT',
          ownerHash: parseStr(inst['owner.hash']) || 'unknown',
          tokenAddress: parseStr(inst['token.address']) || 'unknown',
          tokenValue: parseStr(inst['token.value']) || null,
          visible: inst['visible'] !== false && inst['visible'] !== 0 && inst['visible'] !== 'false',
        },
        update: {
          name: parseStr(inst['metadata.name']) || 'Unknown NFT',
          ownerHash: parseStr(inst['owner.hash']) || 'unknown',
        },
      })
    }
    console.log(`Inserted ${instances.length} NFT instances`)
  }

  // SystemConfig defaults
  await prisma.systemConfig.upsert({
    where: { key: 'batchCutoffDays' },
    create: { key: 'batchCutoffDays', value: '7' },
    update: {},
  })
  console.log('Seeded SystemConfig defaults')

  console.log('Seed complete!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
