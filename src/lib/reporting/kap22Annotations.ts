import { prisma } from '@/lib/prisma'
import { getReportingConfig } from '@/lib/system/config'
import { normalizeAddress } from '@/lib/system/addresses'
import { getWorkspaceReportScope } from './workspaceScope'

export const KAP22_REPORT_KEY = 'KAP22_DAILY_TRANSFER'
export const KAP20_REPORT_KEY = 'KAP20_DAILY_TRANSFER'
export type AnnotationReport = 'kap20' | 'kap22'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

export interface AnnotationInput {
  token: string
  workspace: number | 'all'
  date: string
  event: string
}

function dateKey(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

export async function validateAnnotationInput(input: AnnotationInput, report: AnnotationReport = 'kap22'): Promise<{ tokenContractId: string; workspaceSelectionId: number | null; date: Date; event: string } | null> {
  const event = input.event.normalize('NFC').trim()
  if (!DATE_PATTERN.test(input.date) || event.length < 1 || event.length > 500 || UNSAFE_CONTROL_CHARACTERS.test(event)) return null
  await getWorkspaceReportScope(input.workspace)
  const [config, token] = await Promise.all([
    getReportingConfig(),
    prisma.tokenContract.findFirst({
      where: { normalizedAddress: normalizeAddress(input.token), active: true, ...(input.workspace === 'all' ? {} : { workspaceId: input.workspace }), ...(report === 'kap22' ? { role: 'POINT_TOKEN', standard: 'KAP-22' } : { role: 'PRIMARY_TOKEN', standard: 'KAP-20' }) },
      select: { id: true },
    }),
  ])
  if (!token) return null
  const parsedDate = new Date(`${input.date}T00:00:00.000Z`)
  // Date accepts impossible calendar dates by rolling them into the next month.
  // Require an exact round trip so values such as 2026-02-31 are rejected.
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.date) return null
  const start = dateKey(new Date(config.businessHistoryStart), config.reportingTimezone)
  const today = dateKey(new Date(), config.reportingTimezone)
  if (input.date < start || input.date > today) return null
  return { tokenContractId: token.id, workspaceSelectionId: input.workspace === 'all' ? null : input.workspace, date: parsedDate, event }
}

export async function resolveAnnotationScope(token: string, workspace: number | 'all', report: AnnotationReport = 'kap22'): Promise<{ tokenContractId: string; workspaceSelectionId: number | null } | null> {
  await getWorkspaceReportScope(workspace)
  const contract = await prisma.tokenContract.findFirst({
    where: { normalizedAddress: normalizeAddress(token), active: true, ...(workspace === 'all' ? {} : { workspaceId: workspace }), ...(report === 'kap22' ? { role: 'POINT_TOKEN', standard: 'KAP-22' } : { role: 'PRIMARY_TOKEN', standard: 'KAP-20' }) },
    select: { id: true },
  })
  return contract ? { tokenContractId: contract.id, workspaceSelectionId: workspace === 'all' ? null : workspace } : null
}
