import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth/login', '/api/auth/signup', '/api/auth/demo', '/demo', '/api/demo-links', '/api/demo-site', '/legal', '/site', '/admin', '/api/admin'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Root landing page is public
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/manifest.json') {
    return NextResponse.next();
  }

  // Check for session cookie (web auth)
  const session = req.cookies.get('sd_session')?.value;

  // Check for Bearer token (mobile auth) — API routes only
  const bearer = req.headers.get('authorization')?.startsWith('Bearer ');

  if (!session && !bearer) {
    // API routes get 401 JSON (for mobile clients)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 },
      );
    }
    // Web pages redirect to login
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
