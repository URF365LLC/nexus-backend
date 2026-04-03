import { NextRequest, NextResponse } from 'next/server';

const CASDOOR_URL = process.env.CASDOOR_URL?.trim();
const CASDOOR_APP = process.env.NEXT_PUBLIC_CASDOOR_APP?.trim() || 'app-built-in';
const CASDOOR_ORG = process.env.NEXT_PUBLIC_CASDOOR_ORG?.trim() || 'built-in';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ success: false, error: 'Username and password required' }, { status: 400 });
  }

  if (!CASDOOR_URL) {
    console.error('[Auth] CASDOOR_URL not configured');
    return NextResponse.json({ success: false, error: 'Auth service not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(`${CASDOOR_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application: CASDOOR_APP,
        organization: CASDOOR_ORG,
        username,
        password,
        autoSignin: true,
        type: 'login',
      }),
    });

    const data = await res.json();

    if (data.status !== 'ok' || !data.data) {
      const msg = data.msg || 'Invalid credentials';
      return NextResponse.json({ success: false, error: msg }, { status: 401 });
    }

    const token: string = data.data;
    const response = NextResponse.json({ success: true });

    response.cookies.set('nexus_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: unknown) {
    console.error('[Auth] Casdoor login failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: 'Auth service unreachable' }, { status: 503 });
  }
}
