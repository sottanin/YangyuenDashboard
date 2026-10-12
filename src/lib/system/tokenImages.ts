import { lstat, mkdir, readFile, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export const MAX_TOKEN_IMAGE_BYTES = 2 * 1024 * 1024

const MAX_IMAGE_DIMENSION = 8192
const IMAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/

function uint32Be(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false)
}

function uint32Le(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)
}

function validDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION
}

function matchesPng(bytes: Uint8Array): boolean {
  if (bytes.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return false
  if (uint32Be(bytes, 8) !== 13 || new TextDecoder().decode(bytes.slice(12, 16)) !== 'IHDR') return false
  if (!validDimensions(uint32Be(bytes, 16), uint32Be(bytes, 20))) return false
  // IEND must be the final chunk. This also rejects simple PNG/polyglot payloads.
  return new TextDecoder().decode(bytes.slice(-8, -4)) === 'IEND'
}

function matchesJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return false
  let offset = 2
  while (offset + 4 <= bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) return false
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) return false
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return false
      return validDimensions((bytes[offset + 5] << 8) | bytes[offset + 6], (bytes[offset + 3] << 8) | bytes[offset + 4])
    }
    offset += length
  }
  return false
}

function matchesWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 30 || new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP') return false
  // RIFF size excludes its first eight bytes; exact equality rejects appended data.
  if (uint32Le(bytes, 4) + 8 !== bytes.length) return false
  const chunk = new TextDecoder().decode(bytes.slice(12, 16))
  if (chunk === 'VP8X') return validDimensions(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16))
  if (chunk === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return false
    return validDimensions((bytes[26] | (bytes[27] << 8)) & 0x3fff, (bytes[28] | (bytes[29] << 8)) & 0x3fff)
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return false
    return validDimensions(1 + bytes[21] + ((bytes[22] & 0x3f) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10))
  }
  return false
}

const IMAGE_TYPES = {
  'image/png': { extension: 'png', matches: matchesPng },
  'image/jpeg': { extension: 'jpg', matches: matchesJpeg },
  'image/webp': { extension: 'webp', matches: matchesWebp },
} as const

export type TokenImageMimeType = keyof typeof IMAGE_TYPES

function imageDirectory(): string {
  return process.env.TOKEN_IMAGE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'token-images')
}

export function detectTokenImageType(bytes: Uint8Array): TokenImageMimeType | null {
  const entry = Object.entries(IMAGE_TYPES).find(([, definition]) => definition.matches(bytes))
  return entry?.[0] as TokenImageMimeType | undefined ?? null
}

export async function storeTokenImage(bytes: Uint8Array, mimeType: TokenImageMimeType): Promise<string> {
  const directory = imageDirectory()
  await mkdir(directory, { recursive: true })
  const key = `${randomUUID()}.${IMAGE_TYPES[mimeType].extension}`
  await writeFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ directory, key), bytes, { flag: 'wx', mode: 0o600 })
  return key
}

export async function readTokenImage(key: string): Promise<Buffer> {
  if (!IMAGE_KEY_PATTERN.test(key)) throw new Error('Invalid image key')
  const filePath = path.join(/*turbopackIgnore: true*/ imageDirectory(), key)
  const metadata = await lstat(filePath)
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 || metadata.size > MAX_TOKEN_IMAGE_BYTES) throw new Error('Invalid image file')
  return readFile(/*turbopackIgnore: true*/ filePath)
}

export async function removeTokenImage(key: string | null): Promise<void> {
  if (!key || !IMAGE_KEY_PATTERN.test(key)) return
  try { await unlink(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ imageDirectory(), key)) } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}
