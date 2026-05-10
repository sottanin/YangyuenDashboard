import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { name, address } = body
  if (!name || !address) {
    return NextResponse.json({ error: 'name and address are required' }, { status: 400 })
  }
  const token = await prisma.tokenContract.update({ where: { id }, data: { name, address } })
  return NextResponse.json(token)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.tokenContract.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
