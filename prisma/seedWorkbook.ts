import type { CellValue, Worksheet } from 'exceljs'
import { Prisma } from '@prisma/client'

export function parseDecimal(value: unknown): Prisma.Decimal {
  if (value === null || value === undefined || value === '') return new Prisma.Decimal(0)
  try {
    if (typeof value === 'string') {
      const normalizedValue = value.trim()
      return normalizedValue ? new Prisma.Decimal(normalizedValue) : new Prisma.Decimal(0)
    }
    if (typeof value === 'bigint') return new Prisma.Decimal(value.toString())
    const numberValue = Number(value)
    return Number.isNaN(numberValue) ? new Prisma.Decimal(0) : new Prisma.Decimal(numberValue)
  } catch {
    return new Prisma.Decimal(0)
  }
}

export function parseDate(value: unknown): Date {
  if (!value) return new Date(0)
  if (value instanceof Date) return value
  if (typeof value === 'number') {
    // Excel's 1900 date system includes the non-existent 1900-02-29 at serial 60.
    const wholeDays = Math.floor(value)
    const adjustedDays = wholeDays >= 60 ? wholeDays - 1 : wholeDays
    const milliseconds = Math.round((value - wholeDays) * 86_400_000)
    return new Date(Date.UTC(1899, 11, 31 + adjustedDays) + milliseconds)
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
}

export function parseStr(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function parseInt2(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number.parseInt(String(value), 10)
  return Number.isNaN(numberValue) ? null : numberValue
}

export function parseBigInt(value: unknown): bigint | null {
  if (value === null || value === undefined || value === '') return null
  try {
    if (typeof value === 'bigint') return value
    if (typeof value === 'string') {
      const normalizedValue = value.trim()
      if (/^[+-]?\d+$/.test(normalizedValue)) return BigInt(normalizedValue)
    }
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? BigInt(Math.round(numberValue)) : null
  } catch {
    return null
  }
}

const DANGEROUS_HEADER_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function unwrapCellValue(value: CellValue): unknown {
  if (value === null) return undefined
  if (value instanceof Date) return value
  if (typeof value !== 'object') return value
  if ('result' in value) return unwrapCellValue(value.result as CellValue)
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  if ('text' in value) return value.text
  if ('error' in value) return undefined
  return String(value)
}

export function worksheetToRows(worksheet: Worksheet | undefined): Record<string, unknown>[] {
  if (!worksheet) return []

  const headers = worksheet.getRow(1).values
  if (!Array.isArray(headers)) return []

  const rows: Record<string, unknown>[] = []
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const record = Object.create(null) as Record<string, unknown>
    let hasValue = false
    for (let column = 1; column < headers.length; column += 1) {
      const header = parseStr(unwrapCellValue(headers[column] as CellValue))
      if (!header || DANGEROUS_HEADER_KEYS.has(header)) continue
      const value = unwrapCellValue(row.getCell(column).value)
      if (value !== undefined && value !== '') {
        record[header] = value
        hasValue = true
      }
    }
    if (hasValue) rows.push(record)
  })
  return rows
}
