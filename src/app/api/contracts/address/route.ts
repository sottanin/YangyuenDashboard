import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const addresses = await prisma.addressContract.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(addresses)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, address } = body
  if (!name || !address) {
    return NextResponse.json({ error: 'name and address are required' }, { status: 400 })
  }
  const record = await prisma.addressContract.create({ data: { name, address } })
  return NextResponse.json(record, { status: 201 })
}
