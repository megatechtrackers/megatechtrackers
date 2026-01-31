import { NextResponse } from 'next/server';
import { getMetrics, getContentType } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const metrics = await getMetrics();
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': getContentType(),
      },
    });
  } catch (e) {
    console.error('Metrics error:', e);
    return new NextResponse('', { status: 500 });
  }
}
