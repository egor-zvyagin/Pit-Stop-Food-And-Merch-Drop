/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';
const allowedOrigin = isDev
  ? 'http://localhost:3000'
  : (process.env.NEXT_PUBLIC_APP_URL || 'https://main.d3m92lj3xoqgf9.amplifyapp.com');

const nextConfig = {
  poweredByHeader: false,
  env: {
    DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME || 'pitstop_data',
    DYNAMO_ACCESS_KEY_ID: process.env.DYNAMO_ACCESS_KEY_ID || '',
    DYNAMO_SECRET_ACCESS_KEY: process.env.DYNAMO_SECRET_ACCESS_KEY || '',
    ED25519_KEY_ID: process.env.ED25519_KEY_ID || 'AGPC-2027-KEY-01',
    ED25519_PRIVATE_KEY_BASE64: process.env.ED25519_PRIVATE_KEY_BASE64 || '',
    ED25519_PUBLIC_KEY_BASE64: process.env.ED25519_PUBLIC_KEY_BASE64 || '',
    VENDOR_ACCESS_PIN: process.env.VENDOR_ACCESS_PIN || '2026',
    USE_LOCAL_STORAGE: process.env.USE_LOCAL_STORAGE || 'false',
  },
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
