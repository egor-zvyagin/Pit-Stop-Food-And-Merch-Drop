import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { validateVendorAuth } from '@/lib/auth/vendorAuth';
import { InventoryRestockSchema } from '@/lib/validation/schemas';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

// Always run on request: these responses are live data and must never be
// frozen into the build.
export const dynamic = 'force-dynamic';

const rateLimiter = createRateLimiter('vendor');

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/inventory/restock', method: 'POST' });

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

    const parsed = InventoryRestockSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      logger.log({ status: 400, error: errorMsg });
      return NextResponse.json(
        { success: false, error: errorMsg, details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { mode, itemId, stock } = parsed.data;

    if (mode === 'flash_drop' && !itemId) {
      logger.log({ status: 400, error: 'itemId is required for flash_drop mode' });
      return NextResponse.json(
        { success: false, error: 'itemId is required for flash_drop mode' },
        { status: 400 }
      );
    }

    const result = await db.restockInventory(mode, itemId, stock);
    const allItems = await db.getItems();

    logger.log({ status: 200, dbOp: 'restockInventory' });
    return NextResponse.json({
      success: true,
      message: `Inventory restocked successfully (${mode})`,
      mode,
      updatedItems: result.updated,
      items: allItems,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to restock inventory: ${message}` },
      { status: 500 }
    );
  }
}
