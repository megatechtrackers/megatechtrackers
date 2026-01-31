import { NextRequest, NextResponse } from 'next/server';

const ACCESS_GATEWAY_URL =
  process.env.ACCESS_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_ACCESS_GATEWAY_URL ||
  'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get session cookie from request
    const sessionId = request.cookies.get('sid')?.value;
    const frappeUser = request.cookies.get('frappe_user')?.value || body.frappeUser;
    
    // Log for debugging
    console.log('Grafana embed URL request (via Access Gateway):', {
      hasSessionId: !!sessionId,
      hasFrappeUser: !!frappeUser,
      reportId: body.reportId,
      accessGatewayUrl: ACCESS_GATEWAY_URL,
    });
    
    if (!frappeUser) {
      return NextResponse.json(
        { error: 'Missing Frappe user', message: 'Frappe user information is required' },
        { status: 401 }
      );
    }
    
    // Forward request to Access Gateway
    const response = await fetch(`${ACCESS_GATEWAY_URL}/api/grafana/generate-embed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Frappe-User': frappeUser,
        'X-Frappe-Session-Id': sessionId ? `sid=${sessionId}` : '',
        ...(request.headers.get('x-request-id') && {
          'X-Request-ID': request.headers.get('x-request-id')!,
        }),
      },
      body: JSON.stringify({
        reportId: body.reportId,
        reportUid: body.reportUid,
        filters: body.filters || {},
        frappeUser: frappeUser,
      }),
    });

    const responseText = await response.text();
    let errorData: any = {};
    
    try {
      errorData = JSON.parse(responseText);
    } catch {
      errorData = { message: responseText };
    }

    if (!response.ok) {
      console.error('Access Gateway error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
      return NextResponse.json(
        { 
          error: errorData.error || 'Failed to generate embed URL', 
          message: errorData.message || `Access Gateway returned ${response.status}`,
          details: errorData
        },
        { status: response.status }
      );
    }
    
    const data = JSON.parse(responseText);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Grafana embed URL proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to generate embed URL', message: error.message },
      { status: 500 }
    );
  }
}
