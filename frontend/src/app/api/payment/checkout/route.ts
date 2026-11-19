import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { CheckoutSchema } from '@/lib/validation/schemas';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';

const rateLimiter = createRateLimiter('orders');

// In-memory idempotency cache for checkout operations
const idempotencyStore = new Map<string, { statusCode: number; payload: Record<string, unknown> }>();

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/payment/checkout', method: 'POST' });

  // Rate Limiting
  const limit = rateLimiter.consume();
  if (!limit.allowed && limit.response) {
    logger.log({ status: 429, error: 'Rate limit exceeded' });
    return limit.response;
  }

  try {
    // 1. Idempotency Key check from header or body
    const headerIdempotencyKey =
      request.headers.get('idempotency-key') ||
      request.headers.get('Idempotency-Key');

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

    const parsed = CheckoutSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      logger.log({ status: 400, error: errorMsg });
      return NextResponse.json(
        { success: false, error: errorMsg, details: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      orderId,
      method,
      paymentMethod: aliasMethod,
      amount,
      currency = 'AUD',
      pointsRedeemed = 0,
      idempotencyKey: bodyIdempotencyKey,
    } = parsed.data;

    const resolvedMethod = method || aliasMethod || 'apple_pay';
    const idempotencyKey = headerIdempotencyKey || bodyIdempotencyKey;

    if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
      const cached = idempotencyStore.get(idempotencyKey)!;
      logger.log({ status: cached.statusCode, dbOp: 'idempotent-replay' });
      return NextResponse.json(cached.payload, { status: cached.statusCode });
    }

    // 2. Validate order exists in database
    const order = (await db.getOrderById(orderId)) || (await db.getOrderByPin(orderId));
    if (!order) {
      logger.log({ status: 404, error: `Order '${orderId}' not found in database` });
      return NextResponse.json(
        { success: false, error: `Order '${orderId}' not found in database` },
        { status: 404 }
      );
    }

    // 3. Update order payment status to PAID
    await db.updateOrderPaymentStatus(order.orderId, 'PAID');

    // 4. Generate authorized transaction response
    const transactionId = `TXN-GP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const responsePayload = {
      success: true,
      message: 'Payment authorized successfully',
      data: {
        transactionId,
        orderId: order.orderId,
        amountCharged: amount,
        currency,
        paymentMethod: resolvedMethod,
        pointsRedeemed,
        status: 'PAID',
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toISOString(),
      },
    };

    if (idempotencyKey) {
      idempotencyStore.set(idempotencyKey, {
        statusCode: 200,
        payload: responsePayload,
      });
    }

    logger.log({ status: 200, dbOp: 'updateOrderPaymentStatus' });
    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Payment authorization failed: ${message}` },
      { status: 500 }
    );
  }
}
