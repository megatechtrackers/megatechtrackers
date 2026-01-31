import { NextRequest, NextResponse } from 'next/server';
import { httpRequestsTotal, httpRequestDurationSeconds } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Internal endpoint: receives request metrics from the custom server and
 * updates Prometheus counters/histograms.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method = 'GET', path = '/', status = 200, duration = 0 } = body as {
      method?: string;
      path?: string;
      status?: number;
      duration?: number;
    };
    const pathNorm = path || '/';
    const statusStr = String(status);
    httpRequestsTotal.inc({ method, path: pathNorm, status: statusStr });
    httpRequestDurationSeconds.observe({ method, path: pathNorm }, duration);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Metrics record error:', e);
    return new NextResponse('', { status: 500 });
  }
}
