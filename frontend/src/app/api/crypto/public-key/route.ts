import { NextResponse } from 'next/server';
import { getPublicKeyBase64 } from '@/lib/crypto/passSigner';
import { PublicKeyResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const keyId = process.env.ED25519_KEY_ID || 'AGPC-2027-KEY-01';
  const publicKeyBase64 = getPublicKeyBase64();

  const responsePayload: PublicKeyResponse = {
    keyId,
    publicKeyBase64,
    algorithm: 'Ed25519',
    format: 'spki-der-base64',
  };

  return NextResponse.json(responsePayload, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
