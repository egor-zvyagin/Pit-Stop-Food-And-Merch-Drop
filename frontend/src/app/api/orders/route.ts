import { NextResponse } from 'next/server';
import { db, OrderItemRecord, OrderRecord } from '@/lib/db/client';
import { Ed25519PassEngine, OrderPassPayload } from '@/lib/crypto/passEngine';
import { PIT_STOPS } from '@/data/pitStopConstantData';

interface CreateOrderRequest {
  items: OrderItemRecord[];
  stationId: string;
  isGroupOrder?: boolean;
  ticketCode?: string;
  promoCode?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateOrderRequest;
    const { items, stationId = 'M2', isGroupOrder = false, ticketCode = 'GP-3820-X', promoCode } = body;

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

    // 1. Calculate pricing
    const subtotal = Number(
      items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2)
    );

    // Dynamic Yield Discount Engine: 20% Trackside Green-Flag or 15% PITSTOP15
    let discountPct = 0.20;
    let discountRate = '20% OFF (EatClub Trackside Active)';

    if (promoCode?.toUpperCase() === 'PITSTOP15') {
      discountPct = 0.15;
      discountRate = '15% OFF (PITSTOP15 Promotional)';
    }

    const discountAmount = Number((subtotal * discountPct).toFixed(2));
    const total = Number((subtotal - discountAmount).toFixed(2));

    // 2. Concession Pod lookup
    const targetPod = PIT_STOPS.find((p) => p.id === stationId) || PIT_STOPS[1]; // Default to M2
    const lockerCounter = `#0${Math.floor(1 + Math.random() * 8)}`;
    const pinCode = String(Math.floor(1000 + Math.random() * 9000));
    const orderId = `GP-${pinCode}`;

    // 3. Issue Asymmetric Cryptographic Ed25519 Pass
    const currentEpoch = Math.floor(Date.now() / 1000);
    const passPayload: OrderPassPayload = {
      orderId,
      customerId: `TICKET-${ticketCode}`,
      targetStationId: targetPod.id,
      issuedAt: currentEpoch,
      expiresAt: currentEpoch + 3600, // Valid for 1 hour
      items: items.map((i) => ({
        sku: i.itemId || i.name.toLowerCase().replace(/\s+/g, '-'),
        name: i.name,
        quantity: i.quantity,
        unitPriceCents: Math.round(i.unitPrice * 100),
      })),
      nonce: crypto.randomUUID(),
    };

    const signedPass = Ed25519PassEngine.issueSignedPass(passPayload);

    // 4. Persist to Database
    const nowIso = new Date().toISOString();
    const orderRecord: OrderRecord = {
      orderId,
      pinCode,
      customerId: passPayload.customerId,
      ticketCode,
      isGroupOrder,
      items,
      subtotal,
      discountAmount,
      discountRate,
      total,
      loyaltyPointsEarned: Math.round(total * 2),
      pickupStationId: targetPod.id,
      pickupStationName: targetPod.name,
      counterNumber: lockerCounter,
      walkTimeMins: 2,
      qrPayload: signedPass.qrPayload,
      signatureBase64: signedPass.signatureBase64,
      status: 'RECEIVED',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.createOrder(orderRecord);

    return NextResponse.json(
      {
        success: true,
        message: 'Order created, Ed25519 pass cryptographically signed, express locker reserved',
        order: orderRecord,
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

export async function GET() {
  try {
    const orders = await db.getAllOrders();
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
