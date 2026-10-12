import { prisma } from '@/lib/prisma'

export const CONFIG_DEFAULTS = {
  reportingTimezone: 'Asia/Bangkok',
  businessHistoryStart: '2025-10-29T14:02:37+07:00',
  defaultReportRangeDays: '30',
  aggregateMarketplaceVersions: 'true',
  batchCutoffDays: '7',
  batchScheduleEnabled: 'false',
} as const

export type ConfigKey = keyof typeof CONFIG_DEFAULTS
export type ReportingConfig = Record<ConfigKey, string>

export const CONFIG_KEYS = Object.keys(CONFIG_DEFAULTS) as ConfigKey[]

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return value.includes('/')
  } catch {
    return false
  }
}

export function validateConfigValue(key: ConfigKey, value: string): string | null {
  if (value.length > 100) return 'Configuration value is too long'
  if (key === 'reportingTimezone') return isIanaTimezone(value) ? null : 'Reporting timezone must be a valid IANA timezone'
  if (key === 'businessHistoryStart') return Number.isNaN(Date.parse(value)) ? 'Business history start must be a valid date and time' : null
  if (key === 'defaultReportRangeDays') return ['7', '30', '90', 'all'].includes(value) ? null : 'Default report range must be 7, 30, 90, or all'
  if (key === 'aggregateMarketplaceVersions') return ['true', 'false'].includes(value) ? null : 'Marketplace aggregation must be true or false'
  if (key === 'batchCutoffDays') return ['7', '30', 'all'].includes(value) ? null : 'Batch cutoff must be 7, 30, or all'
  if (key === 'batchScheduleEnabled') return ['true', 'false'].includes(value) ? null : 'Batch schedule enabled must be true or false'
  return 'Unsupported configuration key'
}

export function parseConfigPayload(input: unknown): { values?: Partial<ReportingConfig>; error?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Configuration body must be an object' }
  const source = input as Record<string, unknown>
  const rawValues: Record<string, unknown> = typeof source.values === 'object' && source.values !== null && !Array.isArray(source.values)
    ? source.values as Record<string, unknown>
    : source
  const values: Partial<ReportingConfig> = {}
  for (const [rawKey, rawValue] of Object.entries(rawValues)) {
    if (!CONFIG_KEYS.includes(rawKey as ConfigKey)) return { error: `Unsupported configuration key: ${rawKey}` }
    if (typeof rawValue !== 'string') return { error: `${rawKey} must be a string` }
    const key = rawKey as ConfigKey
    const value = rawValue.trim()
    const validationError = validateConfigValue(key, value)
    if (validationError) return { error: validationError }
    values[key] = value
  }
  if (Object.keys(values).length === 0) return { error: 'At least one configuration value is required' }
  return { values }
}

export async function getReportingConfig(): Promise<ReportingConfig> {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: CONFIG_KEYS } } })
  const result: ReportingConfig = { ...CONFIG_DEFAULTS }
  for (const row of rows) {
    if (CONFIG_KEYS.includes(row.key as ConfigKey)) result[row.key as ConfigKey] = row.value
  }
  return result
}

export async function saveReportingConfig(values: Partial<ReportingConfig>): Promise<ReportingConfig> {
  await prisma.$transaction(Object.entries(values).map(([key, value]) => prisma.systemConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })))
  return getReportingConfig()
}
