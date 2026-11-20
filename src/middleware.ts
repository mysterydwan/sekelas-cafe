import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'sekelas-cafe-dev-secret-change-in-production'
)

const PROTECTED = [
  '/dashboard',
  '/pos',
  '/kitchen',
  '/orders',
  '/products',
  '/stock',
  '/reports',
  '/data',
  '/users',
  '/settings',
  '/activity',
]

const PAGE_ROLES: Record<string, string[]> = {
  '/dashboard': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/pos': ['ADMIN', 'CASHIER'],
  '/kitchen': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/orders': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/products': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/stock': ['ADMIN', 'CASHIER', 'BARISTA'],
  '/reports': ['ADMIN', 'CASHIER'],
  '/data': ['ADMIN', 'CASHIER'],
  '/users': ['ADMIN'],
  '/settings': ['ADMIN'],
  '/activity': ['ADMIN'],
}

const HOME: Record<string, string> = {
  ADMIN: '/dashboard',
  CASHIER: '/pos',
  BARISTA: '/kitchen',
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const matched = PROTECTED.find((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!matched) return NextResponse.next()

  const token = req.cookies.get('sekelas_session')?.value
  if (!token) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  try {
    const { payload } = await jwtVerify(token, SECRET)
    const role = String(payload.role ?? '')
    const allowed = PAGE_ROLES[matched] ?? []
    if (!allowed.includes(role)) {
      return NextResponse.redirect(new URL(HOME[role] ?? '/login', req.url))
    }
    return NextResponse.next()
  } catch {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/pos/:path*',
    '/kitchen/:path*',
    '/orders/:path*',
    '/products/:path*',
    '/stock/:path*',
    '/reports/:path*',
    '/data/:path*',
    '/users/:path*',
    '/settings/:path*',
    '/activity/:path*',
  ],
}
