import axios from 'axios';
import Cookies from 'js-cookie';

const FRAPPE_URL = process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000';
const ACCESS_GATEWAY_URL = process.env.NEXT_PUBLIC_ACCESS_GATEWAY_URL || 'http://localhost:3001';

// Get axios instance with Frappe session (using Next.js proxy to avoid CORS)
const getFrappeClient = () => {
  // Don't manually set Cookie header - browsers block it as "unsafe header"
  // Use withCredentials: true to automatically send cookies
  return axios.create({
    baseURL: '/api/frappe', // Use Next.js proxy route
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      // Don't set Cookie header manually - browser will reject it
      // Cookies (sid, frappe_sid, frappe_user) are sent automatically via withCredentials: true
    },
    withCredentials: true, // This automatically sends all cookies
  });
};

// Get axios instance for Access Gateway (using Next.js proxy to avoid CORS)
const getGrafanaClient = () => {
  // Try both js-cookie and document.cookie, also check frappe_sid as backup
  const sessionId = Cookies.get('sid') || Cookies.get('frappe_sid') || 
    document.cookie.split(';').find(c => {
      const trimmed = c.trim();
      return trimmed.startsWith('sid=') || trimmed.startsWith('frappe_sid=');
    })?.split('=')[1]?.trim();
  const frappeUser = Cookies.get('frappe_user') || document.cookie.split(';').find(c => c.trim().startsWith('frappe_user='))?.split('=')[1]?.trim();
  // Format session ID as cookie string for Frappe validation
  const sessionCookie = sessionId ? `sid=${sessionId}` : '';
  return axios.create({
    baseURL: '/api/grafana', // Use Next.js proxy route
    headers: {
      'X-Frappe-User': frappeUser || '',
      'X-Frappe-Session-Id': sessionCookie, // Send as cookie string format
      'Content-Type': 'application/json',
    },
    withCredentials: true, // Include cookies in requests
  });
};

export async function getUserPermissions(user: string) {
  const client = getFrappeClient();
  const response = await client.get(
    `/method/megatechtrackers.api.permissions.get_user_permissions`,
    {
      params: { user },
    }
  );
  return response.data.message;
}

function cleanDashboardUid(uid: string): string {
  if (!uid) return uid;
  let cleaned = uid.trim().replace(/^\/+|\/+$/g, '');
  cleaned = cleaned.replace(/^(d|dashboard)\//i, '');
  const segments = cleaned.split('/').filter(s => s.length > 0);
  if (segments.length === 0) return uid;
  if (segments.length > 1) {
    const firstSegment = segments[0];
    if (segments.every(s => s === firstSegment)) {
      cleaned = firstSegment;
    } else {
      cleaned = segments[segments.length - 1];
    }
  } else {
    cleaned = segments[0];
  }
  return cleaned;
}

export async function generateEmbedUrl({
  reportId,
  reportUid,
  filters,
  frappeUser,
}: {
  reportId: number;
  reportUid?: string;
  filters: Record<string, any>;
  frappeUser: string;
}) {
  // Clean UID before sending to service
  const cleanedUid = reportUid ? cleanDashboardUid(reportUid) : undefined;
  // Use Next.js API route to proxy the request (handles cookies properly)
  const response = await axios.post(
    '/api/grafana/generate-embed-url',
    {
      reportId,
      reportUid: cleanedUid,
      filters,
      frappeUser,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    }
  );
  // Access Gateway returns { success: true, embedUrl: "...", expiresAt: "..." }
  return response.data.embedUrl || response.data.embed_url;
}

export async function getAvailableReports() {
  const client = getGrafanaClient();
  // baseURL is already '/api/grafana', so we need to call /reports
  // The rewrite rule: /api/grafana/:path* -> ${accessGatewayUrl}/api/:path*
  // So we call /reports which becomes ${accessGatewayUrl}/api/reports
  const response = await client.get('/reports');
  return response.data.reports;
}
