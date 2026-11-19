import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { validateVendorAuth } from '@/lib/auth/vendorAuth';
import { UpdateCircuitStatusSchema } from '@/lib/validation/schemas';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

const rateLimiter = createRateLimiter('standard');

export async function GET() {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/circuit/status', method: 'GET' });

  // Rate Limiting
  const limit = rateLimiter.consume();
  if (!limit.allowed && limit.response) {
    logger.log({ status: 429, error: 'Rate limit exceeded' });
    return limit.response;
  }

  try {
    const circuitState = await db.getCircuitState();
    logger.log({ status: 200, dbOp: 'getCircuitState' });

    return NextResponse.json({
      success: true,
      circuit: circuitState,
      ...circuitState,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to fetch circuit status: ${message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/circuit/status', method: 'PATCH' });

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
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      logger.log({ status: 400, error: 'Invalid JSON request body' });
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parsed = UpdateCircuitStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      logger.log({ status: 400, error: errorMsg });
      return NextResponse.json(
        { success: false, error: errorMsg, details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { flag, message: overrideMessage } = parsed.data;
    const updatedState = await db.setCircuitState(flag, 'vendor-portal', overrideMessage);

    logger.log({ status: 200, dbOp: 'setCircuitState' });
    return NextResponse.json({
      success: true,
      circuit: updatedState,
      ...updatedState,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to update circuit status: ${message}` },
      { status: 500 }
    );
  }
}
