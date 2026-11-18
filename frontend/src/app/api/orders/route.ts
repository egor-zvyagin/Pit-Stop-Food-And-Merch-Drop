import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, OrderItemRecord, OrderRecord } from '@/lib/db/client';
import { Ed25519PassEngine, OrderPassPayload } from '@/lib/crypto/passEngine';
import { PIT_STOPS } from '@/data/pitStopConstantData';
import { CATALOG_BY_ID } from '@/data/catalog';
import { calculateOrderPricing } from '@/lib/pricing';

interface CreateOrderRequest {
  items: OrderItemRecord[];
  stationId?: string;
  isGroupOrder?: boolean;
  ticketCode?: string;
  promoCode?: string;
  circuitStatus?: string;
}

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
  try {
    const body = (await request.json()) as CreateOrderRequest;
    const {
      items,
      stationId = 'M2',
      isGroupOrder = false,
      ticketCode = 'GP-3820-X',
      promoCode,
      circuitStatus = 'GREEN_FLAG',
    } = body;

    // Validate empty items
    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Order must contain at least one item' },
        { status: 400 }
      );
    }

    // Validate positive quantities
    const invalidItems = items.filter((i) => !i.quantity || i.quantity <= 0);
    if (invalidItems.length > 0) {
      return NextResponse.json(
        { success: false, error: 'All order items must have a positive quantity' },
        { status: 400 }
      );
    }

    // 1. Authoritative Pricing via calculateOrderPricing
    const pricing = calculateOrderPricing(items, promoCode, circuitStatus);

    // Standardize items with canonical catalog data
    const canonicalItems: OrderItemRecord[] = items.map((i) => {
      const catItem = CATALOG_BY_ID.get(i.itemId || '');
      return {
        itemId: catItem ? catItem.id : i.itemId,
        name: catItem ? catItem.name : i.name,
        quantity: i.quantity,
        unitPrice: catItem ? catItem.price : i.unitPrice,
        sku: catItem ? catItem.id : i.sku,
        image: catItem ? catItem.image : i.image,
      };
    });

    // 2. Concession Pod lookup & Locker assignment
    const targetPod = PIT_STOPS.find((p) => p.id === stationId) || PIT_STOPS[1]; // Default M2
    const lockerCounter = `#0${Math.floor(1 + Math.random() * 8)}`;
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

    // 4. Persist to Database with 7-day TTL
    const nowIso = new Date().toISOString();
    const ttl = currentEpoch + 7 * 86400; // 7 days in epoch seconds

    const orderRecord: OrderRecord = {
      orderId,
      pinCode,
      customerId: passPayload.customerId,
      ticketCode,
      isGroupOrder,
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

    await db.createOrder(orderRecord);

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
    return NextResponse.json(
      { success: false, error: `Failed to process order creation: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    let ticketCode: string | null = null;
    try {
      const url = new URL(request.url);
      ticketCode = url.searchParams.get('ticketCode');
    } catch {
      ticketCode = null;
    }

    const orders = ticketCode ? await db.getOrders(ticketCode) : await db.getAllOrders();

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to fetch orders: ${message}` },
      { status: 500 }
    );
  }
}
