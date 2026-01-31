import { NextRequest, NextResponse } from 'next/server';

const FRAPPE_URL = process.env.FRAPPE_URL || process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward login request to Frappe
    const response = await fetch(`${FRAPPE_URL}/api/method/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        usr: body.usr,
        pwd: body.pwd,
      }),
    });

    const data = await response.json();
    
    // Extract session ID from set-cookie header
    const setCookieHeader = response.headers.get('set-cookie');
    let sessionId: string | null = null;
    
    if (setCookieHeader) {
      // Extract sid from cookie string (format: "sid=...; Path=/; ...")
      const sidMatch = setCookieHeader.match(/sid=([^;]+)/);
      if (sidMatch) {
        sessionId = sidMatch[1];
        console.log('[API] Extracted sessionId from Frappe response:', sessionId.substring(0, 10) + '...');
      }
    }
    
    if (!sessionId) {
      console.warn('[API] No sessionId found in Frappe response');
    }
    
    // Create Next.js response with the data and session ID
    const nextResponse = NextResponse.json({
      ...data,
      sessionId: sessionId, // Include session ID in response body
    });
    
    // Set cookies in the response so they're available to the client
    if (sessionId) {
      // Extract username from request body (it's the login username)
      const username = body.usr || data.full_name || 'Administrator';
      
      // Set cookies using Set-Cookie headers (primary method)
      // Use both 'sid' (for compatibility) and 'frappe_sid' (as backup)
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
      
      // Primary cookie: sid
      const sidCookie = `sid=${sessionId}; Path=/; Expires=${expires}; SameSite=Lax`;
      // Backup cookie with different name (in case 'sid' is blocked)
      const frappeSidCookie = `frappe_sid=${sessionId}; Path=/; Expires=${expires}; SameSite=Lax`;
      const userCookie = `frappe_user=${encodeURIComponent(username)}; Path=/; Expires=${expires}; SameSite=Lax`;
      
      // Set cookies via headers
      nextResponse.headers.append('Set-Cookie', sidCookie);
      nextResponse.headers.append('Set-Cookie', frappeSidCookie);
      nextResponse.headers.append('Set-Cookie', userCookie);
      
      // Also try Next.js cookies API
      try {
        nextResponse.cookies.set('sid', sessionId, {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          secure: false,
          maxAge: 60 * 60 * 24 * 7,
        });
        
        nextResponse.cookies.set('frappe_sid', sessionId, {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          secure: false,
          maxAge: 60 * 60 * 24 * 7,
        });
        
        nextResponse.cookies.set('frappe_user', username, {
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          secure: false,
          maxAge: 60 * 60 * 24 * 7,
        });
      } catch (e) {
        console.warn('[API] Next.js cookies API failed, using headers only:', e);
      }
      
      console.log('[API] Cookies set via Set-Cookie headers:', {
        sid: sessionId.substring(0, 10) + '...',
        frappe_sid: sessionId.substring(0, 10) + '...',
        user: username
      });
    } else {
      console.warn('[API] Cannot set cookies - no sessionId available');
    }
    
    return nextResponse;
  } catch (error: any) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { message: 'Login failed', error: error.message },
      { status: 500 }
    );
  }
}
