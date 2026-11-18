import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

interface CheckoutRequest {
  orderId: string;
  paymentMethod?: 'apple_pay' | 'google_pay' | 'credit_card' | 'grand_prix_points' | string;
  amount: number;
  currency?: string;
  pointsRedeemed?: number;
  idempotencyKey?: string;
}

// In-memory idempotency cache for checkout operations
const idempotencyStore = new Map<string, { statusCode: number; payload: Record<string, unknown> }>();

export async function POST(request: Request) {
  try {
    // 1. Idempotency Key check from header or body
    const headerIdempotencyKey =
      request.headers.get('idempotency-key') ||
      request.headers.get('Idempotency-Key');

    const body = (await request.json()) as CheckoutRequest;
    const {
      orderId,
      paymentMethod = 'apple_pay',
      amount,
      currency = 'AUD',
      pointsRedeemed = 0,
      idempotencyKey: bodyIdempotencyKey,
    } = body;

    const idempotencyKey = headerIdempotencyKey || bodyIdempotencyKey;

    if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
      const cached = idempotencyStore.get(idempotencyKey)!;
      return NextResponse.json(cached.payload, { status: cached.statusCode });
    }

    // 2. Validate required inputs
    if (!orderId || typeof amount !== 'number') {
      return NextResponse.json(
        { success: false, error: 'orderId and valid amount are required' },
        { status: 400 }
      );
    }

    // 3. Validate order exists in database
    const order = (await db.getOrderById(orderId)) || (await db.getOrderByPin(orderId));
    if (!order) {
      return NextResponse.json(
        { success: false, error: `Order '${orderId}' not found in database` },
        { status: 404 }
      );
    }

    // 4. Update order payment status to PAID
    await db.updateOrderPaymentStatus(order.orderId, 'PAID');

    // 5. Generate authorized transaction response
    const transactionId = `TXN-GP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const responsePayload = {
      success: true,
      message: 'Payment authorized successfully',
      data: {
        transactionId,
        orderId: order.orderId,
        amountCharged: amount,
        currency,
        paymentMethod,
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

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Payment authorization failed: ${message}` },
      { status: 500 }
    );
  }
}
