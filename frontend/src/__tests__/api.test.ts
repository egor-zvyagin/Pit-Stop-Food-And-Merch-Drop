import { describe, it, expect } from 'vitest';
import { GET as getPublicKeyRoute } from '@/app/api/crypto/public-key/route';
import { POST as createOrderRoute } from '@/app/api/orders/route';
import { PATCH as patchOrderStatusRoute } from '@/app/api/orders/[id]/status/route';
import { POST as checkoutRoute } from '@/app/api/payment/checkout/route';
import { GET as getRewardsRoute } from '@/app/api/rewards/route';
import { GET as getInventoryRoute } from '@/app/api/inventory/route';
import { GET as getStationsRoute } from '@/app/api/stations/capacity/route';
import { POST as verifyTicketRoute } from '@/app/api/auth/verify-ticket/route';
import { verifyQrPayload } from '@/lib/crypto/passVerifier';
import { TEST_VENDOR_PIN } from './testEnv';

describe('Serverless API Integration Test Suite', () => {
  let createdOrderId: string;
  let createdPinCode: string;
  let createdOrderTotal: number;
  let createdQrPayload: string;

  it('GET /api/crypto/public-key returns 200 with publicKeyBase64', async () => {
    const res = await getPublicKeyRoute();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.publicKeyBase64).toBeDefined();
    expect(typeof data.publicKeyBase64).toBe('string');
    expect(data.algorithm).toBe('Ed25519');
    expect(data.format).toBe('spki-der-base64');
    expect(data.keyId).toBeDefined();
  });

  it('POST /api/orders generates GP-2026-* orderId and valid Ed25519 pass', async () => {
    const req = new Request('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { itemId: 'apex-burger', quantity: 2, unitPrice: 16.5 },
          { itemId: 'craft-lager', quantity: 1, unitPrice: 36.0 },
        ],
        stationId: 'M2',
        ticketCode: 'GP-3820-X',
        promoCode: 'PITSTOP15',
      }),
    });

    const res = await createOrderRoute(req);
    expect([200, 201]).toContain(res.status);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.order).toBeDefined();

    createdOrderId = data.order.orderId;
    createdOrderTotal = data.order.total;
    createdQrPayload = data.order.qrPayload;

    // Verify orderId format matches GP-2026-<6-character base36/alphanumeric>
    expect(createdOrderId).toMatch(/^GP-2026-[A-Z0-9]{6}$/);

    // Verify pickup PIN is a 4-digit code
    expect(data.order.pinCode).toMatch(/^\d{4}$/);
    createdPinCode = data.order.pinCode;

    // Verify cryptographic Ed25519 pass was issued
    expect(createdQrPayload).toBeDefined();
    expect(createdQrPayload.startsWith('AGPC1.')).toBe(true);

    // Verify the generated QR payload validates offline against station M2
    const verifyResult = verifyQrPayload(createdQrPayload, 'M2');
    expect(verifyResult.isValid).toBe(true);
    expect(verifyResult.orderId).toBe(createdOrderId);
  });

  it('POST /api/orders rejects invalid payload with 400', async () => {
    const emptyReq = new Request('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });

    const res = await createOrderRoute(emptyReq);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/payment/checkout processes payment and supports idempotency', async () => {
    expect(createdOrderId).toBeDefined();
    const idempotencyKey = `idemp-${Date.now()}-${Math.random()}`;

    const payReq = new Request('http://localhost:3000/api/payment/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        orderId: createdOrderId,
        paymentMethod: 'apple_pay',
        amount: createdOrderTotal,
        pinCode: createdPinCode,
      }),
    });

    // Knowing only the order ID is not enough to mark an order as paid
    const noPinReq = new Request('http://localhost:3000/api/payment/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: createdOrderId,
        paymentMethod: 'apple_pay',
        amount: createdOrderTotal,
      }),
    });
    expect((await checkoutRoute(noPinReq)).status).toBe(401);

    const res = await checkoutRoute(payReq);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('PAID');
    expect(data.data.transactionId).toBeDefined();

    const originalTxId = data.data.transactionId;

    // Second call with identical idempotency key must return cached authorized response
    const secondPayReq = new Request('http://localhost:3000/api/payment/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        orderId: createdOrderId,
        paymentMethod: 'apple_pay',
        amount: createdOrderTotal,
        pinCode: createdPinCode,
      }),
    });

    const secondRes = await checkoutRoute(secondPayReq);
    expect(secondRes.status).toBe(200);
    const secondData = await secondRes.json();
    expect(secondData.data.transactionId).toBe(originalTxId);
  });

  it('PATCH /api/orders/[id]/status requires X-Vendor-Pin and awards points on COMPLETED', async () => {
    expect(createdOrderId).toBeDefined();

    // 1. Without vendor PIN -> 401 Unauthorized
    const unauthReq = new Request(`http://localhost:3000/api/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY_FOR_PICKUP' }),
    });
    const unauthRes = await patchOrderStatusRoute(unauthReq, { params: Promise.resolve({ id: createdOrderId }) });
    expect(unauthRes.status).toBe(401);

    // 2. With incorrect vendor PIN -> 401 Unauthorized
    const wrongPinReq = new Request(`http://localhost:3000/api/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Vendor-Pin': '9999',
      },
      body: JSON.stringify({ status: 'READY_FOR_PICKUP' }),
    });
    const wrongPinRes = await patchOrderStatusRoute(wrongPinReq, { params: Promise.resolve({ id: createdOrderId }) });
    expect(wrongPinRes.status).toBe(401);

    // 3. With correct vendor PIN -> 200 OK update to READY_FOR_PICKUP
    const validPinReq = new Request(`http://localhost:3000/api/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Vendor-Pin': TEST_VENDOR_PIN,
      },
      body: JSON.stringify({ status: 'READY_FOR_PICKUP' }),
    });
    const validRes = await patchOrderStatusRoute(validPinReq, { params: Promise.resolve({ id: createdOrderId }) });
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.success).toBe(true);

    // 4. Without the staff PIN, completing an order needs that order's own PIN
    const patchAsFan = (pin?: string) =>
      patchOrderStatusRoute(
        new Request(`http://localhost:3000/api/orders/${createdOrderId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(pin ? { 'X-Order-Pin': pin } : {}),
          },
          body: JSON.stringify({ status: 'COMPLETED' }),
        }),
        { params: Promise.resolve({ id: createdOrderId }) }
      );

    expect((await patchAsFan()).status).toBe(401);
    const wrongOrderPin = createdPinCode === '0000' ? '1111' : '0000';
    expect((await patchAsFan(wrongOrderPin)).status).toBe(401);

    const fanCompleteRes = await patchAsFan(createdPinCode);
    expect(fanCompleteRes.status).toBe(200);
    const fanCompleteData = await fanCompleteRes.json();
    expect(fanCompleteData.order.status).toBe('COMPLETED');
  });

  it('GET /api/rewards returns ticket points and badges', async () => {
    const req = new Request('http://localhost:3000/api/rewards?ticketCode=GP-3820-X');
    const res = await getRewardsRoute(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.ticketCode).toBe('GP-3820-X');
    expect(typeof body.data.points).toBe('number');
    expect(Array.isArray(body.data.badges)).toBe(true);
    expect(body.data.badges.length).toBeGreaterThan(0);
    expect(Array.isArray(body.data.vouchers)).toBe(true);
  });

  it('GET /api/inventory returns 200 with catalog items', async () => {
    const res = await getInventoryRoute(new Request("http://localhost/api/inventory"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThan(0);
    expect(Array.isArray(body.inventory)).toBe(true);
  });

  it('GET /api/stations/capacity returns 200 and handles filtering & 404s', async () => {
    // All stations
    const reqAll = new Request('http://localhost:3000/api/stations/capacity');
    const resAll = await getStationsRoute(reqAll);
    expect(resAll.status).toBe(200);
    const dataAll = await resAll.json();
    expect(dataAll.totalStations).toBe(4);

    // Specific station filter
    const reqM1 = new Request('http://localhost:3000/api/stations/capacity?stationId=M1');
    const resM1 = await getStationsRoute(reqM1);
    expect(resM1.status).toBe(200);
    const dataM1 = await resM1.json();
    expect(dataM1.station.id).toBe('M1');

    // Invalid station -> 404
    const req404 = new Request('http://localhost:3000/api/stations/capacity?stationId=POD-NONEXISTENT');
    const res404 = await getStationsRoute(req404);
    expect(res404.status).toBe(404);
  });

  it('POST /api/auth/verify-ticket verifies valid tickets and handles errors', async () => {
    // Valid ticket
    const validReq = new Request('http://localhost:3000/api/auth/verify-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: 'GP-3820-X' }),
    });
    const validRes = await verifyTicketRoute(validReq);
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.data.verified).toBe(true);
    expect(validData.data.holderName).toBeDefined();

    // Invalid ticket -> 404
    const invalidReq = new Request('http://localhost:3000/api/auth/verify-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: 'INVALID-TICKET-CODE' }),
    });
    const invalidRes = await verifyTicketRoute(invalidReq);
    expect(invalidRes.status).toBe(404);

    // Empty ticket -> 400
    const emptyReq = new Request('http://localhost:3000/api/auth/verify-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketCode: '' }),
    });
    const emptyRes = await verifyTicketRoute(emptyReq);
    expect(emptyRes.status).toBe(400);
  });
});

describe('Order options and server-side race flag', () => {
  it('stores only the kitchen options the catalogue defines for an item', async () => {
    const req = new Request('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { itemId: 'apex-burger', quantity: 1, options: ['no-pickles', 'extra-gold-leaf'] },
          { itemId: 'apex-burger', quantity: 1 },
        ],
        stationId: 'M1',
        ticketCode: 'GP-9014-P',
      }),
    });

    const res = await createOrderRoute(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.order.items[0].options).toEqual(['No pickles']);
    expect(data.order.items[1].options).toBeUndefined();
  });

  it('prices at the flag the server holds, not one the client sends', async () => {
    const { db } = await import('@/lib/db/client');
    await db.setCircuitState('RED_FLAG', 'test');

    const req = new Request('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ itemId: 'still-water', quantity: 2 }],
        stationId: 'M1',
        ticketCode: 'GP-9014-P',
        circuitStatus: 'POST_RACE',
      }),
    });

    try {
      const res = await createOrderRoute(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      // Red flag: no discount, so the client's claimed 15% is not applied.
      expect(data.pricing.dynamicYieldDiscount).toBe(0);
      expect(data.order.subtotal).toBe(9);
    } finally {
      await db.setCircuitState('GREEN_FLAG', 'test');
    }
  });
});
