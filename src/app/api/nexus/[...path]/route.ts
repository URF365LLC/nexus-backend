import { NextRequest } from 'next/server';

const NEXUS_API_URL = process.env.NEXUS_API_URL;
const NEXUS_API_KEY = process.env.NEXUS_API_KEY;

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>
): Promise<Response> {
  if (!NEXUS_API_URL || !NEXUS_API_KEY) {
    return Response.json(
      { success: false, error: 'Backend not configured' },
      { status: 503 }
    );
  }

  const { path } = await params;
  const backendPath = path.join('/');
  const search = request.nextUrl.search;
  const upstreamUrl = `${NEXUS_API_URL}/${backendPath}${search}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Api-Key': NEXUS_API_KEY,
  };

  const init: RequestInit = { method: request.method, headers };

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    init.body = await request.text();
  }

  const upstream = await fetch(upstreamUrl, init);
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}
