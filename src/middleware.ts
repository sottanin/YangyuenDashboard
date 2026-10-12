import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session'

const PUBLIC_API_PREFIXES = ['/api/auth']
const PUBLIC_API_PATHS = ['/api/internal/batch-schedule/run']
const PROTECTED_PATHS = ['/dashboard', '/api']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  if (PUBLIC_API_PATHS.includes(pathname) || PUBLIC_API_PREFIXES.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (session) {
    const headers = new Headers(request.headers)
    headers.set('x-dashboard-pathname', pathname)
    return NextResponse.next({ request: { headers } })
  }

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/admin/login'
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
