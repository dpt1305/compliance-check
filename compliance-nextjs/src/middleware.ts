import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken, COOKIE_NAME } from './lib/auth/jwt';

const ADMIN_API_PREFIX = '/api/admin';
const ADMIN_PAGE_PREFIX = '/admin';

async function resolveToken(req: NextRequest): Promise<string | null> {
  // 1. Authorization header (used by JS fetch calls)
  const headerToken = extractBearerToken(req.headers.get('authorization'));
  if (headerToken) return headerToken;
  // 2. HttpOnly session cookie (persists across tab closes)
  return req.cookies.get(COOKIE_NAME)?.value ?? null;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Protect /api/admin/** — require valid JWT (header or cookie)
  if (pathname.startsWith(ADMIN_API_PREFIX)) {
    const token = await resolveToken(req);
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const username = await verifyToken(token);
    if (!username) {
      return NextResponse.json({ message: 'Unauthorized: invalid or expired token' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Protect admin pages (except login) — redirect to login if no valid cookie
  if (pathname.startsWith(ADMIN_PAGE_PREFIX) && !pathname.startsWith('/admin/login')) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
    const username = await verifyToken(token);
    if (!username) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*', '/admin/:path*'],
};
