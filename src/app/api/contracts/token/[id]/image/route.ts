import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeSystemMutation } from '@/lib/system/authorization'
import { detectTokenImageType, MAX_TOKEN_IMAGE_BYTES, readTokenImage, removeTokenImage, storeTokenImage } from '@/lib/system/tokenImages'

interface RouteContext { params: Promise<{ id: string }> }
const MAX_MULTIPART_BYTES = MAX_TOKEN_IMAGE_BYTES + 64 * 1024

async function readMultipartBody(request: NextRequest): Promise<Uint8Array | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}

function denied(authorization: 'unauthorized' | 'forbidden'): NextResponse {
  return NextResponse.json({ error: authorization === 'unauthorized' ? 'Unauthorized' : 'Only superadmin can change token images' }, { status: authorization === 'unauthorized' ? 401 : 403 })
}

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params
  const token = await prisma.tokenContract.findUnique({ where: { id }, select: { imageKey: true } })
  if (!token?.imageKey) return new NextResponse(null, { status: 404 })
  try {
    const body = await readTokenImage(token.imageKey)
    const mimeType = detectTokenImageType(body)
    if (!mimeType) return new NextResponse(null, { status: 404 })
    return new NextResponse(Uint8Array.from(body).buffer, { headers: { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) {
    console.error('Token image GET error:', error)
    return new NextResponse(null, { status: 404 })
  }
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return denied(authorization)
  const { id } = await params
  const token = await prisma.tokenContract.findUnique({ where: { id }, select: { id: true, imageKey: true } })
  if (!token) return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  try {
    const contentLength = request.headers.get('content-length')
    // Reject oversized multipart bodies before request.formData() buffers them.
    // Allow a small fixed envelope for multipart headers and boundaries.
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_MULTIPART_BYTES)) {
      return NextResponse.json({ error: 'Image must be 2 MB or smaller' }, { status: 413 })
    }
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
      return NextResponse.json({ error: 'Content-Type must be multipart/form-data' }, { status: 415 })
    }
    const rawBody = await readMultipartBody(request)
    if (!rawBody) return NextResponse.json({ error: 'Image must be 2 MB or smaller' }, { status: 413 })
    const bodyBuffer = new ArrayBuffer(rawBody.byteLength)
    new Uint8Array(bodyBuffer).set(rawBody)
    const bufferedRequest = new Request(request.url, { method: 'POST', headers: request.headers, body: bodyBuffer })
    let form: FormData
    try {
      form = await bufferedRequest.formData()
    } catch {
      return NextResponse.json({ error: 'Malformed multipart form data' }, { status: 400 })
    }
    const file = form.get('image')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Select an image file' }, { status: 400 })
    if (file.size <= 0 || file.size > MAX_TOKEN_IMAGE_BYTES) return NextResponse.json({ error: 'Image must be 2 MB or smaller' }, { status: 413 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mimeType = detectTokenImageType(bytes)
    if (!mimeType) return NextResponse.json({ error: 'Only valid PNG, JPEG, and WebP images are supported' }, { status: 400 })
    const imageKey = await storeTokenImage(bytes, mimeType)
    try {
      await prisma.tokenContract.update({ where: { id }, data: { imageKey, imageMimeType: mimeType } })
    } catch (error) {
      await removeTokenImage(imageKey)
      throw error
    }
    await removeTokenImage(token.imageKey)
    return NextResponse.json({ imageUrl: `/api/contracts/token/${id}/image` })
  } catch (error) {
    console.error('Token image POST error:', error)
    return NextResponse.json({ error: 'Failed to save token image' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const authorization = await authorizeSystemMutation()
  if (authorization !== 'allowed') return denied(authorization)
  const { id } = await params
  const token = await prisma.tokenContract.findUnique({ where: { id }, select: { imageKey: true } })
  if (!token) return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  await prisma.tokenContract.update({ where: { id }, data: { imageKey: null, imageMimeType: null } })
  await removeTokenImage(token.imageKey)
  return NextResponse.json({ success: true })
}
