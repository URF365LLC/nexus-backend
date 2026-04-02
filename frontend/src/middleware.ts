import { NextResponse, NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public paths through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/favicon.ico') ||
    pathname === '/login' ||
    pathname === '/callback' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Check for session cookie
  const session = request.cookies.get('nexus_session');

  if (!session) {
    // 3. Redirect to Casdoor OIDC login
    const casdoorUrl = process.env.CASDOOR_URL || process.env.NEXT_PUBLIC_CASDOOR_URL;
    const clientId = process.env.CASDOOR_CLIENT_ID || process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID || '';

    if (casdoorUrl && clientId) {
      const redirectUri = encodeURIComponent(`${request.nextUrl.origin}/callback`);
      const state = encodeURIComponent(pathname);
      const loginRedirect = `${casdoorUrl}/login/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=read&state=${state}`;
      return NextResponse.redirect(loginRedirect);
    }

    // Fallback to local login page
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
