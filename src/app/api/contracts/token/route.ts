import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const tokens = await prisma.tokenContract.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(tokens)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, address } = body
  if (!name || !address) {
    return NextResponse.json({ error: 'name and address are required' }, { status: 400 })
  }
  const token = await prisma.tokenContract.create({ data: { name, address } })
  return NextResponse.json(token, { status: 201 })
}
