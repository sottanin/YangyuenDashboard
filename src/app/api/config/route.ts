import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ALLOWED_KEYS = ['batchCutoffDays'] as const
const ALLOWED_VALUES: Record<string, string[]> = {
  batchCutoffDays: ['7', '30', 'all'],
}

export async function GET() {
  try {
    const configs = await prisma.systemConfig.findMany()
    const result: Record<string, string> = {}
    for (const c of configs) result[c.key] = c.value
    return NextResponse.json(result)
  } catch (error) {
    console.error('Config GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as { key?: string; value?: string }
    const { key, value } = body

    if (!key || !ALLOWED_KEYS.includes(key as typeof ALLOWED_KEYS[number])) {
      return NextResponse.json({ error: 'Invalid config key' }, { status: 400 })
    }
    if (value === undefined || value === null) {
      return NextResponse.json({ error: 'Value is required' }, { status: 400 })
    }
    if (ALLOWED_VALUES[key] && !ALLOWED_VALUES[key].includes(value)) {
      return NextResponse.json({ error: `Invalid value. Allowed: ${ALLOWED_VALUES[key].join(', ')}` }, { status: 400 })
    }

    const updated = await prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Config PUT error:', error)
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}
