import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { validateVendorAuth } from '@/lib/auth/vendorAuth';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

// Always run on request: these responses are live data and must never be
// frozen into the build.
export const dynamic = 'force-dynamic';

const rateLimiter = createRateLimiter('vendor');

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/stations/lockers', method: 'GET' });

  // 1. Authenticate with X-Vendor-Pin
  const auth = validateVendorAuth(request);
  if (!auth.authenticated) {
    logger.log({ status: 401, error: auth.error });
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized: Missing or invalid X-Vendor-Pin header' },
      { status: 401 }
    );
  }

  // 2. Rate Limiting
  const limit = rateLimiter.consume();
  if (!limit.allowed && limit.response) {
    logger.log({ status: 429, error: 'Rate limit exceeded' });
    return limit.response;
  }

  try {
    let stationId = 'M2';
    try {
      const url = new URL(request.url);
      const queryStation = url.searchParams.get('stationId');
      if (queryStation) {
        stationId = queryStation.trim().toUpperCase();
      }
    } catch {
      stationId = 'M2';
    }

    const bays = await db.getLockerBayStatus(stationId);
    const occupiedCount = bays.filter((b) => b.status === 'OCCUPIED').length;

    logger.log({ status: 200, dbOp: 'getLockerBayStatus' });
    return NextResponse.json({
      success: true,
      stationId,
      totalBays: 8,
      occupiedCount,
      availableCount: 8 - occupiedCount,
      bays,
      lockers: bays,
      data: bays,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to fetch locker bays: ${message}` },
      { status: 500 }
    );
  }
}
