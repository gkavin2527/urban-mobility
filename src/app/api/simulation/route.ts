import { NextRequest, NextResponse } from 'next/server';
import { publicError } from '@/lib/traffic/database.mjs';
import { getComparison, simulationOverview, startComparison, stopComparison } from '@/lib/simulation/service.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: any) {
  const message = String(error?.message || 'Simulation request failed');
  const validation = /^(Invalid simulation|Simulation comparison not found)/.test(message);
  const conflict = message === 'A simulation is already running';
  console.error('[simulation-api]', { code: error?.code || 'REQUEST_ERROR', validation, conflict });
  return NextResponse.json(
    { error: validation || conflict ? message : publicError(error) },
    { status: conflict ? 409 : validation ? 400 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action') || 'overview';
    const data = action === 'overview' ? await simulationOverview() :
      action === 'pair' ? await getComparison(request.nextUrl.searchParams.get('group')) : null;
    if (!data) return NextResponse.json({ error: 'Unknown simulation action' }, { status: 400 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host')) {
      return NextResponse.json({ error: 'Origin rejected' }, { status: 403 });
    }
    const text = await request.text();
    if (text.length > 4096) return NextResponse.json({ error: 'Request is too large' }, { status: 413 });
    let body: any;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const data = body.action === 'startPair' ? await startComparison(body) :
      body.action === 'stopPair' ? await stopComparison(body.group) : null;
    if (!data) return NextResponse.json({ error: 'Unknown simulation action' }, { status: 400 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
