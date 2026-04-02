import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { code, state } = await req.json();

    if (!code) {
      return NextResponse.json({ success: false, error: 'No code provided' }, { status: 400 });
    }

    const casdoorUrl = process.env.CASDOOR_URL || process.env.NEXT_PUBLIC_CASDOOR_URL || '';
    const clientId = process.env.CASDOOR_CLIENT_ID || process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID || '';
    const clientSecret = process.env.CASDOOR_CLIENT_SECRET || '';

    if (!casdoorUrl || !clientId || !clientSecret) {
      console.error('Missing Casdoor env vars:', { casdoorUrl: !!casdoorUrl, clientId: !!clientId, clientSecret: !!clientSecret });
      return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
    }

    // CRITICAL: redirect_uri must match exactly what was sent in the authorization request
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://nexus.komedia-ltd-co.com'}/callback`;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    console.log('Exchanging code with redirect_uri:', redirectUri);

    const res = await fetch(`${casdoorUrl}/api/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    console.log('Token exchange response status:', res.status, 'has token:', !!data.access_token);

    if (data.access_token) {
      const cookieStore = await cookies();
      cookieStore.set('nexus_session', data.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 1 week
        path: '/',
      });

      return NextResponse.json({ success: true });
    }

    console.error('Token exchange failed:', JSON.stringify(data));
    return NextResponse.json({ success: false, error: data.error || 'Token exchange failed' }, { status: 401 });

  } catch (err) {
    console.error('Auth route error:', err);
    return NextResponse.json({ success: false, error: 'Server error during authentication' }, { status: 500 });
  }
}
