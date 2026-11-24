import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, OrderItemRecord, OrderRecord, InsufficientStockError } from '@/lib/db/client';
import { Ed25519PassEngine, OrderPassPayload } from '@/lib/crypto/passEngine';
import { PIT_STOPS } from '@/data/pitStopConstantData';
import { CATALOG_BY_ID } from '@/data/catalog';
import { calculateOrderPricing } from '@/lib/pricing';
import { CreateOrderSchema } from '@/lib/validation/schemas';
import { createRateLimiter } from '@/lib/validation/rateLimit';
import { createRequestLogger, generateRequestId } from '@/lib/logger';
import { validateVendorAuth } from '@/lib/auth/vendorAuth';

// Always run on request: these responses are live data and must never be
// frozen into the build.
export const dynamic = 'force-dynamic';

const rateLimiter = createRateLimiter('orders');

/**
 * Generates an order ID adhering to canonical GP-2026-<6-character alphanumeric> format
 * Example: GP-2026-X9K2P4
 */
function generateOrderId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GP-2026-${randomPart}`;
}

/**
 * Generates a collision-checked 4-digit pickup PIN
 */
async function generateUniquePin(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await db.getOrderByPin(pin);
    if (!existing) {
      return pin;
    }
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/orders', method: 'POST' });

  // Rate Limiting
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
      logger.log({ status: 400, error: 'Malformed JSON payload' });
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    // Zod validation
    const parsed = CreateOrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      logger.log({ status: 400, error: errorMsg });
      return NextResponse.json(
        { success: false, error: errorMsg, details: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      items,
      pickupStationId,
      stationId,
      isGroupOrder = false,
      seatNote,
      ticketCode = 'GP-3820-X',
      promoCode,
      circuitStatus,
    } = parsed.data;

    const chosenStationId = pickupStationId || stationId || 'M2';

    // 1. Authoritative Pricing via calculateOrderPricing with live CircuitState
    const activeCircuit = await db.getCircuitState();
    const effectiveCircuit = circuitStatus || activeCircuit;
    const pricing = calculateOrderPricing(items, promoCode, effectiveCircuit);

    // Standardize items with canonical catalog data
    const canonicalItems: OrderItemRecord[] = items.map((i) => {
      const rawId = i.itemId || i.id || i.sku || '';
      const catItem = CATALOG_BY_ID.get(rawId);
      return {
        itemId: catItem ? catItem.id : rawId,
        name: catItem ? catItem.name : i.name || 'Concession Item',
        quantity: i.quantity,
        unitPrice: catItem ? catItem.price : i.unitPrice ?? 0,
        sku: catItem ? catItem.id : rawId,
        image: catItem ? catItem.image : i.image,
      };
    });

    // 2. Concession Pod lookup & Smart Locker Bay allocation (#01..#08)
    const targetPod = PIT_STOPS.find((p) => p.id === chosenStationId) || PIT_STOPS[1]; // Default M2
    const lockerCounter = await db.allocateLockerBay(targetPod.id);
    const pinCode = await generateUniquePin();
    const orderId = generateOrderId();

    // 3. Issue Asymmetric Cryptographic Ed25519 Pass
    const currentEpoch = Math.floor(Date.now() / 1000);
    const passPayload: OrderPassPayload = {
      orderId,
      customerId: `TICKET-${ticketCode}`,
      targetStationId: targetPod.id,
      issuedAt: currentEpoch,
      expiresAt: currentEpoch + 3600, // Valid for 1 hour
      items: canonicalItems.map((i) => ({
        sku: i.itemId,
        name: i.name,
        quantity: i.quantity,
        unitPriceCents: Math.round(i.unitPrice * 100),
      })),
      nonce: crypto.randomUUID(),
    };

    const signedPass = Ed25519PassEngine.issueSignedPass(passPayload);

    // 4. Build OrderRecord
    const nowIso = new Date().toISOString();
    const ttl = currentEpoch + 7 * 86400; // 7 days in epoch seconds

    const orderRecord: OrderRecord = {
      orderId,
      pinCode,
      customerId: passPayload.customerId,
      ticketCode,
      isGroupOrder,
      ...(seatNote ? { seatNote } : {}),
      items: canonicalItems,
      subtotal: pricing.subtotal,
      discountAmount: Number((pricing.dynamicYieldDiscount + pricing.voucherDiscount).toFixed(2)),
      discountRate: pricing.effectiveDiscountRate,
      voucherCode: promoCode,
      serviceFee: pricing.serviceFee,
      total: pricing.total,
      loyaltyPointsEarned: pricing.loyaltyPointsEarned,
      pickupStationId: targetPod.id,
      pickupStationName: targetPod.name,
      counterNumber: lockerCounter,
      walkTimeMins: targetPod.id === 'M1' ? 1 : targetPod.id === 'M2' ? 2 : 5,
      qrPayload: signedPass.qrPayload,
      signatureBase64: signedPass.signatureBase64,
      status: 'RECEIVED',
      paymentStatus: 'PENDING',
      createdAt: nowIso,
      updatedAt: nowIso,
      ttl,
    };

    // 5. Atomic Stock Decrement & Order Creation (TransactWriteItems)
    const itemQuantities: Record<string, number> = {};
    for (const item of canonicalItems) {
      itemQuantities[item.itemId] = (itemQuantities[item.itemId] || 0) + item.quantity;
    }

    try {
      await db.createOrderAtomic(orderRecord, itemQuantities);
    } catch (dbErr) {
      if (dbErr instanceof InsufficientStockError) {
        logger.log({ status: 409, error: 'Insufficient stock', dbOp: 'createOrderAtomic' });
        return NextResponse.json(
          {
            success: false,
            code: 'INSUFFICIENT_STOCK',
            error: 'Insufficient stock for one or more requested items',
            availableStock: dbErr.availableStock,
          },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    logger.log({ status: 201, dbOp: 'createOrderAtomic' });

    return NextResponse.json(
      {
        success: true,
        message: 'Order created, Ed25519 pass cryptographically signed, express locker reserved',
        order: orderRecord,
        pricing,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to process order creation: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders
 * Strictly protected by X-Vendor-Pin. Fans query GET /api/orders/history?ticketCode=...
 */
export async function GET(request: Request) {
  const requestId = generateRequestId();
  const logger = createRequestLogger({ requestId, route: '/api/orders', method: 'GET' });

  // Vendor PIN check
  const auth = validateVendorAuth(request);
  if (!auth.authenticated) {
    logger.log({ status: 401, error: auth.error });
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized: Missing or invalid X-Vendor-Pin' },
      { status: 401 }
    );
  }

  try {
    let ticketCode: string | null = null;
    try {
      const url = new URL(request.url);
      ticketCode = url.searchParams.get('ticketCode');
    } catch {
      ticketCode = null;
    }

    const orders = ticketCode ? await db.getOrders(ticketCode) : await db.getAllOrders();

    logger.log({ status: 200, dbOp: 'getOrders' });
    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.log({ status: 500, error: message });
    return NextResponse.json(
      { success: false, error: `Failed to fetch orders: ${message}` },
      { status: 500 }
    );
  }
}
