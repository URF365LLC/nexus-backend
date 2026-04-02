import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');

  // Use the exact origin the request came from for absolute consistency
  const appUrl = req.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', appUrl));
  }

  const casdoorUrl = process.env.CASDOOR_URL || process.env.NEXT_PUBLIC_CASDOOR_URL || '';
  const clientId = process.env.CASDOOR_CLIENT_ID || process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID || '';
  const clientSecret = process.env.CASDOOR_CLIENT_SECRET || '';
  const redirectUri = `${appUrl}/callback`;

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(`${casdoorUrl}/api/login/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await tokenRes.json();

    if (!data.access_token) {
      console.error('Token exchange failed:', JSON.stringify(data));
      // Diagnostic check: Are there whitespace or unexpected chars?
      const diagStr = `ID:[${clientId}] SEC:[${clientSecret.substring(0,4)}...${clientSecret.slice(-4)}] URL:[${casdoorUrl}] REDIRECT:[${redirectUri}]`;
      const errorReason = encodeURIComponent(JSON.stringify(data));
      return NextResponse.redirect(new URL(`/login?error=exchange_failed&details=${errorReason}&msg=${encodeURIComponent(diagStr)}`, appUrl));
    }

    // Determine where to send the user after login
    let destination = '/';
    if (state) {
      try {
        const decoded = decodeURIComponent(state);
        if (decoded.startsWith('/') && !decoded.startsWith('/login') && !decoded.startsWith('/callback')) {
          destination = decoded;
        }
      } catch {}
    }

    // Set cookie on the redirect response
    const response = NextResponse.redirect(new URL(destination, appUrl));
    response.cookies.set('nexus_session', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;

  } catch (err: any) {
    console.error('Callback error:', err);
    return NextResponse.redirect(new URL(`/login?error=server_error&msg=${encodeURIComponent(err.message)}`, appUrl));
  }
}
