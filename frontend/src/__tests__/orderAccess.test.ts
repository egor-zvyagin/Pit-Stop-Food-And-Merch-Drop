import { beforeAll, describe, expect, it } from 'vitest';
import { POST as createOrderRoute } from '@/app/api/orders/route';
import { GET as getOrderStatusRoute } from '@/app/api/orders/[id]/status/route';
import { GET as getOrderHistoryRoute } from '@/app/api/orders/history/route';
import { TEST_VENDOR_PIN } from './testEnv';

/**
 * An order ID travels in every shared tracker link and a ticket code is
 * printed on the ticket. Neither may unlock the collection PIN or the signed
 * QR pass: those are what a kiosk accepts as proof of ownership.
 */
describe('order data access', () => {
  const TICKET = 'GP-3820-X';
  let orderId: string;
  let pinCode: string;

  const getStatus = (id: string, headers: Record<string, string> = {}) =>
    getOrderStatusRoute(new Request(`http://localhost:3000/api/orders/${id}/status`, { headers }), {
      params: { id },
    });

  beforeAll(async () => {
    const res = await createOrderRoute(
      new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ itemId: 'still-water', quantity: 1 }],
          stationId: 'M1',
          ticketCode: TICKET,
        }),
      })
    );
    expect(res.status).toBe(201);
    const { order } = await res.json();
    orderId = order.orderId;
    pinCode = order.pinCode;
  });

  it('shows progress, but no secrets, to someone who only has the order ID', async () => {
    const res = await getStatus(orderId);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.access).toBe('public');
    expect(body.data.status).toBe('RECEIVED');
    expect(body.data.station.id).toBe('M1');
    expect(JSON.stringify(body)).not.toContain(pinCode);
    for (const secret of ['pinCode', 'qrPayload', 'signatureBase64', 'total']) {
      expect(body.data[secret]).toBeUndefined();
    }
  });

  it('gives the pass to the owner, who proves it with the order PIN', async () => {
    const body = await (await getStatus(orderId, { 'X-Order-Pin': pinCode })).json();
    expect(body.access).toBe('owner');
    expect(body.data.pinCode).toBe(pinCode);
    expect(body.data.qrPayload).toMatch(/^AGPC1\./);
  });

  it('treats a wrong order PIN the same as no PIN', async () => {
    const wrong = pinCode === '0000' ? '1111' : '0000';
    const body = await (await getStatus(orderId, { 'X-Order-Pin': wrong })).json();
    expect(body.access).toBe('public');
    expect(body.data.qrPayload).toBeUndefined();
  });

  it('gives the full record to staff', async () => {
    const body = await (await getStatus(orderId, { 'X-Vendor-Pin': TEST_VENDOR_PIN })).json();
    expect(body.access).toBe('vendor');
    expect(body.data.qrPayload).toMatch(/^AGPC1\./);
  });

  it('lets only staff look an order up by its 4-digit PIN', async () => {
    // Otherwise 10,000 requests would enumerate every order.
    expect((await getStatus(pinCode)).status).toBe(404);

    const asStaff = await getStatus(pinCode, { 'X-Vendor-Pin': TEST_VENDOR_PIN });
    expect(asStaff.status).toBe(200);
    expect((await asStaff.json()).data.orderId).toBe(orderId);
  });

  it('returns order history without PINs or passes', async () => {
    const res = await getOrderHistoryRoute(
      new Request(`http://localhost:3000/api/orders/history?ticketCode=${TICKET}`)
    );
    const body = await res.json();

    const mine = body.orders.find((o: { orderId: string }) => o.orderId === orderId);
    expect(mine).toBeDefined();
    expect(mine.total).toBeGreaterThan(0);
    for (const order of body.orders) {
      expect(order.pinCode).toBeUndefined();
      expect(order.qrPayload).toBeUndefined();
      expect(order.signatureBase64).toBeUndefined();
    }
  });
});
