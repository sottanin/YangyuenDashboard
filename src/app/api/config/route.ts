import { NextRequest, NextResponse } from 'next/server'
import { getReportingConfig, parseConfigPayload, saveReportingConfig } from '@/lib/system/config'
import { authorizeSystemMutation } from '@/lib/system/authorization'

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getReportingConfig())
  } catch (error) {
    console.error('Config GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change SYSTEM configuration' }, { status: authorization === 'unauthorized' ? 401 : 403 })
  try {
    const parsed = parseConfigPayload(await req.json())
    if (!parsed.values) return NextResponse.json({ error: parsed.error ?? 'Invalid configuration' }, { status: 400 })
    return NextResponse.json(await saveReportingConfig(parsed.values))
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
    console.error('Config PUT error:', error)
    return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 })
  }
}
