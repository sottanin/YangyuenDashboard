import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeSystemMutation } from '@/lib/system/authorization'
import { prisma } from '@/lib/prisma'
import { startImportJob, startValidationJob } from '@/lib/fitivityJobs'

export const runtime = 'nodejs'

async function authorize(): Promise<NextResponse | null> {
  const result = await authorizeSystemMutation()
  if (result === 'allowed') return null
  return NextResponse.json({ error: result === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can import Fitivity data' }, { status: result === 'unauthorized' ? 401 : 403 })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await authorize()
  if (denied) return denied
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.json() as { action?: string; jobId?: string; overwriteDuplicates?: boolean }
      if (body.action !== 'import' || !body.jobId) return NextResponse.json({ error: 'Invalid import request' }, { status: 400 })
      const job = await prisma.fitivityImportJob.findUnique({ where: { id: body.jobId } })
      if (!job || job.status !== 'VALIDATED') return NextResponse.json({ error: 'This file has not completed validation' }, { status: 409 })
      startImportJob(job.id, body.overwriteDuplicates === true)
      return NextResponse.json({ jobId: job.id, status: 'IMPORTING' }, { status: 202 })
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Select an Excel or CSV file' }, { status: 400 })
    const extension = file.name.toLowerCase().split('.').pop()
    if (extension !== 'xlsx' && extension !== 'csv') return NextResponse.json({ error: 'Only .xlsx and .csv files are supported' }, { status: 400 })
    await prisma.fitivityImportJob.deleteMany({ where: { status: { in: ['VALIDATED', 'COMPLETED', 'FAILED'] }, updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } })
    const job = await prisma.fitivityImportJob.create({ data: { fileName: file.name } })
    const filePath = path.join(os.tmpdir(), `fitivity-${job.id}.${extension}`)
    await fs.promises.writeFile(filePath, Buffer.from(await file.arrayBuffer()))
    startValidationJob(job.id, filePath)
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 })
  } catch (error) {
    console.error('Fitivity job error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Unable to start Fitivity data job' }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await authorize()
  if (denied) return denied
  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? 1) || 1)
  const status = request.nextUrl.searchParams.get('status')
  const pageSize = 100
  const job = await prisma.fitivityImportJob.findUnique({ where: { id: jobId } })
  if (!job) return NextResponse.json({ error: 'Validation job not found' }, { status: 404 })
  const rowWhere = { jobId, ...(status === 'New' || status === 'Duplicate' ? { status } : {}) }
  const includeRows = ['VALIDATED', 'COMPLETED'].includes(job.status)
  const [rows, filteredTotal] = includeRows
    ? await Promise.all([
      prisma.fitivityImportRow.findMany({ where: rowWhere, orderBy: { rowNumber: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.fitivityImportRow.count({ where: rowWhere }),
    ])
    : [[], 0]
  return NextResponse.json({
    job: { ...job, validationErrors: job.validationErrors ?? [] },
    rows: rows.map((row) => ({ ...row, id: row.id.toString(), totalValue: row.totalValue.toString(), date: row.date.toISOString().slice(0, 10) })),
    pagination: { page, pageSize, total: filteredTotal, totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)) },
  })
}
