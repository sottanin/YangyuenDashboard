import fs from 'node:fs'
import ExcelJS from 'exceljs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const HEADERS = ['User ID', 'Metric Type', 'Total Value', 'Count', 'Unit', 'Date', 'Window', 'Workspace ID'] as const
const METRIC_TYPES = new Set(['steps', 'sleep_awake', 'sleep_deep', 'sleep_light', 'sleep_rem', 'active_energy_burned'])
const UNITS = new Set(['MINUTES', 'COUNT', 'CALORIES'])
const WINDOWS = new Set(['calendar', 'sleep_18'])
const NUMBER_PATTERN = /^\d+(?:\.\d+)?$/
const runningJobs = new Set<string>()

type RawCell = string | number | boolean | Date | null | undefined
type RawRow = RawCell[]
type ValidationError = { row: number | null; column: string | null; message: string }

function text(value: RawCell): string {
  if (value === null || value === undefined) return ''
  return value instanceof Date ? value.toISOString() : String(value).trim()
}

function decimalText(value: RawCell): string {
  if (typeof value !== 'number') return text(value)
  if (!Number.isFinite(value)) return ''
  return value.toFixed(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function supportedNumber(value: string): boolean {
  if (value.length > 100 || !NUMBER_PATTERN.test(value)) return false
  return value.split('.')[0].replace(/^0+(?=\d)/, '').length <= 18
}

function dateKey(value: RawCell): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const parsed = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
    return parsed.toISOString().slice(0, 10)
  }
  const candidate = text(value)
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00(?::00(?:\.0+)?)?)?$/)
  if (!match) return null
  const normalized = `${match[1]}-${match[2]}-${match[3]}`
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return parsed.toISOString().slice(0, 10) === normalized ? normalized : null
}

async function* csvRows(filePath: string, onRead?: (bytes: number) => void): AsyncGenerator<RawRow> {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' })
  let row: string[] = []
  let cell = ''
  let quoted = false
  let pendingQuote = false
  let firstCharacter = true
  for await (const source of input) {
    const chunk = String(source)
    onRead?.(input.bytesRead)
    for (let index = 0; index < chunk.length; index += 1) {
      const character = chunk[index]
      if (firstCharacter) { firstCharacter = false; if (character === '\uFEFF') continue }
      if (pendingQuote) {
        pendingQuote = false
        if (character === '"') { cell += '"'; continue }
        quoted = false
      }
      if (quoted) {
        if (character === '"') {
          if (index + 1 < chunk.length) {
            if (chunk[index + 1] === '"') { cell += '"'; index += 1 } else quoted = false
          } else pendingQuote = true
        } else cell += character
      } else if (character === '"') quoted = true
      else if (character === ',') { row.push(cell); cell = '' }
      else if (character === '\n') { row.push(cell.replace(/\r$/, '')); yield row; row = []; cell = '' }
      else cell += character
    }
  }
  if (pendingQuote) quoted = false
  if (quoted) throw new Error('CSV contains an unclosed quoted value')
  if (cell || row.length > 0) { row.push(cell.replace(/\r$/, '')); yield row }
}

async function* xlsxRows(filePath: string, onRead?: (bytes: number) => void): AsyncGenerator<RawRow> {
  const input = fs.createReadStream(filePath)
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    entries: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit',
  })
  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      onRead?.(input.bytesRead)
      const width = Math.max(row.cellCount, HEADERS.length)
      yield Array.from({ length: width }, (_, index) => {
        const value = row.getCell(index + 1).value
        if (value && typeof value === 'object' && 'result' in value) return value.result as RawCell
        if (value && typeof value === 'object' && 'text' in value) return value.text
        return value as RawCell
      })
    }
    break
  }
}

function rows(filePath: string, onRead?: (bytes: number) => void): AsyncGenerator<RawRow> {
  return filePath.toLowerCase().endsWith('.csv') ? csvRows(filePath, onRead) : xlsxRows(filePath, onRead)
}

async function countRecords(jobId: string, filePath: string): Promise<number> {
  let count = 0
  let first = true
  const fileSize = Math.max(1, (await fs.promises.stat(filePath)).size)
  let lastProgress = 0
  for await (const row of rows(filePath, (bytes) => {
    const progress = Math.min(19, Math.max(1, Math.floor((bytes / fileSize) * 20)))
    if (progress > lastProgress) lastProgress = progress
  })) {
    if (first) { first = false; continue }
    if (row.some((value) => text(value) !== '')) count += 1
    if (count % 1000 === 0 && lastProgress > 0) await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { progress: lastProgress } })
  }
  return count
}

async function setFailure(jobId: string, error: unknown, errors: ValidationError[] = []): Promise<void> {
  await prisma.fitivityImportRow.deleteMany({ where: { jobId } })
  await prisma.fitivityImportJob.update({ where: { id: jobId }, data: {
    status: 'FAILED', error: error instanceof Error ? error.message : String(error), validationErrors: errors as Prisma.InputJsonValue,
  } })
}

export function startValidationJob(jobId: string, filePath: string): void {
  if (runningJobs.has(jobId)) return
  runningJobs.add(jobId)
  void validateJob(jobId, filePath).finally(async () => {
    runningJobs.delete(jobId)
    await fs.promises.rm(filePath, { force: true }).catch(() => undefined)
  })
}

async function validateJob(jobId: string, filePath: string): Promise<void> {
  try {
    const totalRecords = await countRecords(jobId, filePath)
    if (totalRecords === 0) throw new Error('The file does not contain any data rows')
    await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { totalRecords, progress: 20 } })

    const workspaces = await prisma.workspace.findMany({ where: { externalId: { not: null } }, select: { id: true, name: true, externalId: true } })
    const workspaceMap = new Map(workspaces.map((workspace) => [workspace.externalId as string, workspace]))
    const seen = new Map<string, number>()
    const errors: ValidationError[] = []
    let headerChecked = false
    let processed = 0
    let batch: Prisma.FitivityImportRowCreateManyInput[] = []

    for await (const raw of rows(filePath)) {
      if (!headerChecked) {
        headerChecked = true
        const headers = raw.map(text)
        if (headers.length !== HEADERS.length || HEADERS.some((header, index) => headers[index] !== header)) throw new Error(`Columns must match exactly: ${HEADERS.join(', ')}`)
        continue
      }
      if (!raw.some((value) => text(value) !== '')) continue
      processed += 1
      const rowNumber = processed + 1
      const userId = text(raw[0])
      const metricType = text(raw[1]).toLowerCase()
      const totalValue = decimalText(raw[2])
      const countText = text(raw[3])
      const unit = text(raw[4]).toUpperCase()
      const date = dateKey(raw[5])
      const window = text(raw[6]).toLowerCase()
      const workspaceExternalId = text(raw[7]).toLowerCase()
      const workspace = workspaceMap.get(workspaceExternalId)
      const rowErrors: ValidationError[] = []
      if (!userId || userId.length > 200) rowErrors.push({ row: rowNumber, column: 'User ID', message: 'User ID is required and must not exceed 200 characters' })
      if (!METRIC_TYPES.has(metricType)) rowErrors.push({ row: rowNumber, column: 'Metric Type', message: 'Unsupported Metric Type' })
      if (!supportedNumber(totalValue)) rowErrors.push({ row: rowNumber, column: 'Total Value', message: 'Total Value must be a non-negative number with up to 18 integer digits' })
      const count = Number(countText)
      if (!/^\d+$/.test(countText) || !Number.isSafeInteger(count) || count < 0) rowErrors.push({ row: rowNumber, column: 'Count', message: 'Count must be a non-negative integer' })
      if (!UNITS.has(unit)) rowErrors.push({ row: rowNumber, column: 'Unit', message: 'Unit must be MINUTES, COUNT, or CALORIES' })
      if (!date) rowErrors.push({ row: rowNumber, column: 'Date', message: 'Date must be a valid date at midnight' })
      if (!WINDOWS.has(window)) rowErrors.push({ row: rowNumber, column: 'Window', message: 'Window must be calendar or sleep_18' })
      if (!workspace) rowErrors.push({ row: rowNumber, column: 'Workspace ID', message: 'Workspace ID is not configured' })

      if (rowErrors.length === 0 && date && workspace) {
        const recordKey = `${workspace.id}\u0000${userId}\u0000${metricType}\u0000${date}`
        const previous = seen.get(recordKey)
        if (previous) rowErrors.push({ row: rowNumber, column: null, message: `Duplicate key inside the file (also row ${previous})` })
        else {
          seen.set(recordKey, rowNumber)
          batch.push({ jobId, rowNumber, userId, metricType, totalValue: new Prisma.Decimal(totalValue).toDecimalPlaces(12), count, unit, date: new Date(`${date}T00:00:00.000Z`), window, workspaceId: workspace.id, workspaceExternalId, workspaceName: workspace.name })
        }
      }
      errors.push(...rowErrors)
      if (batch.length >= 500) { await prisma.fitivityImportRow.createMany({ data: batch }); batch = [] }
      if (processed % 500 === 0) await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { processedRecords: processed, progress: 20 + Math.floor((processed / totalRecords) * 65) } })
      if (errors.length >= 200) break
    }
    if (batch.length > 0) await prisma.fitivityImportRow.createMany({ data: batch })
    if (errors.length > 0) { await setFailure(jobId, new Error('File validation failed'), errors.slice(0, 200)); return }

    await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { processedRecords: processed, progress: 90 } })
    await prisma.$executeRaw`UPDATE "FitivityImportRow" r SET "status" = 'Duplicate' WHERE r."jobId" = ${jobId} AND EXISTS (SELECT 1 FROM "FitivityData" f WHERE f."userId" = r."userId" AND f."metricType" = r."metricType" AND f."date" = r."date" AND f."workspaceId" = r."workspaceId")`
    const grouped = await prisma.fitivityImportRow.groupBy({ by: ['status'], where: { jobId }, _count: { _all: true } })
    const countFor = (status: string) => grouped.find((item) => item.status === status)?._count._all ?? 0
    await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { status: 'VALIDATED', progress: 100, newRecords: countFor('New'), duplicateRecords: countFor('Duplicate') } })
  } catch (error) {
    await setFailure(jobId, error)
  }
}

export function startImportJob(jobId: string, overwriteDuplicates: boolean): void {
  if (runningJobs.has(jobId)) return
  runningJobs.add(jobId)
  void importJob(jobId, overwriteDuplicates).finally(() => runningJobs.delete(jobId))
}

async function importJob(jobId: string, overwriteDuplicates: boolean): Promise<void> {
  try {
    const job = await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { status: 'IMPORTING', progress: 0, importedRecords: 0, overwrittenRecords: 0, overwriteDuplicates } })
    let cursor = BigInt(0)
    let imported = 0
    let overwritten = 0
    let processed = 0
    const targetRecords = job.newRecords + (overwriteDuplicates ? job.duplicateRecords : 0)
    while (true) {
      const batch = await prisma.fitivityImportRow.findMany({ where: { jobId, status: overwriteDuplicates ? { in: ['New', 'Duplicate'] } : 'New', id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 1000 })
      if (batch.length === 0) break
      const firstId = batch[0].id
      const lastId = batch[batch.length - 1].id
      if (overwriteDuplicates) {
        await prisma.$executeRaw`INSERT INTO "FitivityData" ("id", "userId", "metricType", "totalValue", "count", "unit", "date", "window", "isCal", "workspaceId", "createdAt", "updatedAt") SELECT CONCAT('fitivity-', r."jobId", '-', r."id"), r."userId", r."metricType", r."totalValue", r."count", r."unit", r."date", r."window", true, r."workspaceId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "FitivityImportRow" r WHERE r."jobId" = ${jobId} AND r."id" >= ${firstId} AND r."id" <= ${lastId} AND r."status" IN ('New', 'Duplicate') ON CONFLICT ("userId", "metricType", "date", "workspaceId") DO UPDATE SET "totalValue" = EXCLUDED."totalValue", "count" = EXCLUDED."count", "unit" = EXCLUDED."unit", "window" = EXCLUDED."window", "isCal" = true, "updatedAt" = CURRENT_TIMESTAMP`
      } else {
        await prisma.$executeRaw`INSERT INTO "FitivityData" ("id", "userId", "metricType", "totalValue", "count", "unit", "date", "window", "isCal", "workspaceId", "createdAt", "updatedAt") SELECT CONCAT('fitivity-', r."jobId", '-', r."id"), r."userId", r."metricType", r."totalValue", r."count", r."unit", r."date", r."window", true, r."workspaceId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "FitivityImportRow" r WHERE r."jobId" = ${jobId} AND r."id" >= ${firstId} AND r."id" <= ${lastId} AND r."status" = 'New' ON CONFLICT ("userId", "metricType", "date", "workspaceId") DO NOTHING`
      }
      imported += batch.filter((row) => row.status === 'New').length
      overwritten += batch.filter((row) => row.status === 'Duplicate').length
      processed += batch.length
      cursor = batch[batch.length - 1].id
      await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { importedRecords: imported, overwrittenRecords: overwritten, progress: targetRecords === 0 ? 100 : Math.min(99, Math.floor((processed / targetRecords) * 100)) } })
    }
    await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { status: 'COMPLETED', progress: 100, importedRecords: imported, overwrittenRecords: overwritten } })
  } catch (error) {
    await prisma.fitivityImportJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: error instanceof Error ? error.message : String(error) } })
  }
}
