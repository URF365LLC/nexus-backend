import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    // In production, this should be in an environment variable NEXUS_PASSWORD
    const correctPassword = process.env.NEXUS_PASSWORD || 'BellaEsmeralda2019$';

    if (password === correctPassword) {
      const response = NextResponse.json({ success: true });
      
      // Set a session cookie
      response.cookies.set('nexus_session', 'active', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      });

      return response;
    }

    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
