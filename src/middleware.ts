import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session'

const PUBLIC_API_PREFIXES = ['/api/auth']
const PUBLIC_API_PATHS = ['/api/internal/batch-schedule/run']
const PROTECTED_PATHS = ['/dashboard', '/api']
const LEGACY_REPORT_PATHS: Record<string, string> = {
  '/dashboard/kap20-analysis': '/dashboard/tokens',
  '/dashboard/kap22-analysis': '/dashboard/point-tokens',
  '/dashboard/tokens-kap20': '/dashboard/tokens',
  '/dashboard/point-tokens-kap22': '/dashboard/point-tokens',
  '/dashboard/redemptions': '/dashboard/nft-redemptions',
}

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
    const normalizedPathname = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
    const replacementPath = LEGACY_REPORT_PATHS[normalizedPathname]
    if (replacementPath) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = replacementPath
      return NextResponse.redirect(redirectUrl)
    }
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
