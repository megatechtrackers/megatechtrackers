import { NextRequest, NextResponse } from 'next/server';

const FRAPPE_URL = process.env.FRAPPE_URL || process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    // Get session cookie from request (check both 'sid' and 'frappe_sid')
    const headerSessionId = request.headers.get('x-frappe-session-id') || undefined;
    const sessionId =
      request.cookies.get('sid')?.value ||
      request.cookies.get('frappe_sid')?.value ||
      headerSessionId;
    
    if (!sessionId) {
      return NextResponse.json(
        { message: null },
        { status: 401 }
      );
    }
    
    // Forward request to Frappe with the session cookie
    // Use 'sid' format for Frappe (it expects 'sid' cookie name)
    const response = await fetch(`${FRAPPE_URL}/api/method/frappe.auth.get_logged_user`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': `sid=${sessionId}`, // Forward the session cookie (Frappe expects 'sid' name)
      },
    });

    // Frappe usually returns JSON, but on some failures it can return non-JSON.
    const raw = await response.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = { message: null, raw };
    }

    if (response.status === 401 || response.status === 403) {
      // Helpful diagnostics (don't leak full session)
      console.warn('[API] Frappe rejected session for get_logged_user', {
        status: response.status,
        hasSidCookie: !!request.cookies.get('sid')?.value,
        hasFrappeSidCookie: !!request.cookies.get('frappe_sid')?.value,
        usedHeaderFallback: !!headerSessionId,
        sessionPrefix: sessionId.substring(0, 10) + '...',
        upstream: data,
      });
    }
    
    // Return the response
    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error: any) {
    console.error('Session validation proxy error:', error);
    return NextResponse.json(
      { message: null, error: error.message },
      { status: 500 }
    );
  }
}
