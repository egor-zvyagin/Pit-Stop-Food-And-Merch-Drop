/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';
const allowedOrigin = isDev
  ? 'http://localhost:3000'
  : (process.env.NEXT_PUBLIC_APP_URL || 'https://main.d3m92lj3xoqgf9.amplifyapp.com');

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: allowedOrigin,
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PATCH, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Vendor-Pin, Idempotency-Key',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
