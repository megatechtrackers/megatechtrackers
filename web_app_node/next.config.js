/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // For Docker deployment
  env: {
    FRAPPE_URL: process.env.FRAPPE_URL || 'http://localhost:8000',
    ACCESS_GATEWAY_URL: process.env.ACCESS_GATEWAY_URL || 'http://localhost:3001',
  },
  async rewrites() {
    const frappeUrl = process.env.FRAPPE_URL || process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000';
    const accessGatewayUrl = process.env.ACCESS_GATEWAY_URL || process.env.NEXT_PUBLIC_ACCESS_GATEWAY_URL || 'http://localhost:3001';
    
    return [
      {
        source: '/api/frappe/:path*',
        destination: `${frappeUrl}/api/:path*`,
      },
      {
        source: '/api/grafana/:path*',
        destination: `${accessGatewayUrl}/api/:path*`,
      },
    ];
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN', // Allow embedding from same origin (for iframes)
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
