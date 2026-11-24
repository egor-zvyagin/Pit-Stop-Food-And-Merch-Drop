import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST as createOrderRoute, GET as getOrdersRoute } from '@/app/api/orders/route';
import { GET as getOrderHistoryRoute } from '@/app/api/orders/history/route';
import { GET as getOrderPublicRoute } from '@/app/api/orders/[id]/public/route';
import { GET as getCircuitStatusRoute, PATCH as patchCircuitStatusRoute } from '@/app/api/circuit/status/route';
import { db } from '@/lib/db/client';
import { calculateOrderPricing } from '@/lib/pricing';
import { CATALOG_BY_ID } from '@/data/catalog';
import {
  enqueueSyncAction,
  getPendingSyncActions,
  flushSyncQueue,
} from '@/lib/offline/syncQueue';
import { TEST_VENDOR_PIN } from './testEnv';

describe('Pit Stop v3.0 Feature Suite: Concurrency, Security, Lockers & Offline Sync', () => {
  beforeEach(async () => {
    // Reset circuit state to default GREEN_FLAG before each test
    await db.setCircuitState('GREEN_FLAG', 'test-setup');
  });

  // --------------------------------------------------------------------------
  // 1. Atomic Merch Drop Concurrency (TransactWriteItems / Stock Check)
  // --------------------------------------------------------------------------
  describe('1. Atomic Merch Drop Concurrency', () => {
    it('concurrent POST /api/orders racing for stock: 1 -> exactly one 201, one 409 INSUFFICIENT_STOCK, leaving stock: 0', async () => {
      // Set initial stock of gp-cap-2026 to exactly 1
      const merchItem = CATALOG_BY_ID.get('gp-cap-2026');
      expect(merchItem).toBeDefined();

      if (merchItem) {
        await db.saveItem({
          ...merchItem,
          stock: 1,
          availableUnits: 1,
          inStock: true,
          isLimitedDrop: true,
        });
      }

      // Verify item initial stock is 1
      const itemBefore = await db.getItemById('gp-cap-2026');
      expect(itemBefore?.stock).toBe(1);

      // Create two concurrent order requests competing for the single unit
      const payload1 = {
        items: [{ itemId: 'gp-cap-2026', quantity: 1, unitPrice: 85 }],
        stationId: 'M2',
        ticketCode: 'GP-3820-X',
      };
      const payload2 = {
        items: [{ itemId: 'gp-cap-2026', quantity: 1, unitPrice: 85 }],
        stationId: 'M2',
        ticketCode: 'GP-9014-P',
      };

      const req1 = new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload1),
      });
      const req2 = new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload2),
      });

      // Race both orders simultaneously
      const [resA, resB] = await Promise.all([
        createOrderRoute(req1),
        createOrderRoute(req2),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Identify success vs conflict response
      const successRes = resA.status === 201 ? resA : resB;
      const conflictRes = resA.status === 409 ? resA : resB;

      const successData = await successRes.json();
      expect(successData.success).toBe(true);
      expect(successData.order).toBeDefined();

      const conflictData = await conflictRes.json();
      expect(conflictData.success).toBe(false);
      expect(conflictData.code).toBe('INSUFFICIENT_STOCK');
      expect(conflictData.availableStock).toBeDefined();

      // Final item stock must be 0
      const itemAfter = await db.getItemById('gp-cap-2026');
      expect(itemAfter?.stock).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Race Control Flag Dynamic Pricing
  // --------------------------------------------------------------------------
  describe('2. Race Control Flag Dynamic Pricing', () => {
    it('adjusts pricing when CircuitState toggles from GREEN_FLAG (10% off) to SAFETY_CAR (0% off)', async () => {
      const items = [
        { itemId: 'apex-burger', quantity: 2, unitPrice: 16.5 }, // $33.00
      ];

      // 1. Under GREEN_FLAG (10% off-peak yield discount)
      const greenFlagPricing = calculateOrderPricing(items, undefined, 'GREEN_FLAG');
      expect(greenFlagPricing.subtotal).toBe(33.0);
      expect(greenFlagPricing.dynamicYieldDiscount).toBe(3.3); // 10% of $33.00
      expect(greenFlagPricing.total).toBe(30.44); // (33.0 - 3.3) * 1.025 = 30.4425 -> 30.44

      // 2. Under SAFETY_CAR (0% discount, full concourse surge pricing)
      const safetyCarPricing = calculateOrderPricing(items, undefined, 'SAFETY_CAR');
      expect(safetyCarPricing.subtotal).toBe(33.0);
      expect(safetyCarPricing.dynamicYieldDiscount).toBe(0);
      expect(safetyCarPricing.total).toBe(33.83); // 33.0 * 1.025 = 33.825 -> 33.83

      // 3. Test through PATCH /api/circuit/status API route
      const patchReq = new Request('http://localhost:3000/api/circuit/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Pin': TEST_VENDOR_PIN,
        },
        body: JSON.stringify({
          flag: 'SAFETY_CAR',
          message: 'Safety Car Deployed — Concourse Surge Active',
        }),
      });

      const patchRes = await patchCircuitStatusRoute(patchReq);
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.circuit.flag).toBe('SAFETY_CAR');
      expect(patchData.circuit.offPeakDiscountPct).toBe(0);

      // Verify GET /api/circuit/status reflects the update
      const getRes = await getCircuitStatusRoute();
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.flag).toBe('SAFETY_CAR');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Smart Locker Bay Allocation (#01..#08)
  // --------------------------------------------------------------------------
  describe('3. Smart Locker Bay Allocation', () => {
    it('concurrent orders at same station allocate distinct bay numbers #01..#08', async () => {
      // Allocate 5 consecutive bays at station M1
      const allocatedBays = new Set<string>();

      for (let i = 0; i < 5; i++) {
        const bay = await db.allocateLockerBay('M1');
        expect(bay).toMatch(/^#0[1-8]$/);

        // Create an active order occupying this bay
        await db.createOrder({
          orderId: `GP-2026-BAYTEST${i}`,
          pinCode: `990${i}`,
          customerId: `cust-bay-${i}`,
          ticketCode: 'GP-3820-X',
          isGroupOrder: false,
          items: [{ itemId: 'apex-burger', name: 'Apex Burger', quantity: 1, unitPrice: 16.5 }],
          subtotal: 16.5,
          discountAmount: 0,
          discountRate: '0%',
          serviceFee: 0.41,
          total: 16.91,
          loyaltyPointsEarned: 34,
          pickupStationId: 'M1',
          pickupStationName: 'Pit Stop M1 (Fangio East)',
          counterNumber: bay,
          walkTimeMins: 1,
          qrPayload: 'AGPC1.TEST',
          signatureBase64: 'TESTSIG',
          status: 'RECEIVED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        allocatedBays.add(bay);
      }

      // Verify all 5 allocated bays are distinct
      expect(allocatedBays.size).toBe(5);

      // Verify getLockerBayStatus reports occupied bays accurately
      const bayStatus = await db.getLockerBayStatus('M1');
      expect(bayStatus.length).toBe(8);
      const occupied = bayStatus.filter((b) => b.status === 'OCCUPIED');
      expect(occupied.length).toBeGreaterThanOrEqual(5);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Fan Order History & Security Guard
  // --------------------------------------------------------------------------
  describe('4. Fan Order History & Security Guard', () => {
    it('GET /api/orders/history?ticketCode=GP-3820-X returns fan orders, while GET /api/orders requires X-Vendor-Pin', async () => {
      // 1. Fan Order History endpoint: public query by ticketCode
      const historyReq = new Request('http://localhost:3000/api/orders/history?ticketCode=GP-3820-X');
      const historyRes = await getOrderHistoryRoute(historyReq);
      expect(historyRes.status).toBe(200);

      const historyData = await historyRes.json();
      expect(historyData.success).toBe(true);
      expect(Array.isArray(historyData.orders)).toBe(true);

      // 2. Vendor Orders endpoint: reject unauthorized fan request without X-Vendor-Pin
      const unauthReq = new Request('http://localhost:3000/api/orders');
      const unauthRes = await getOrdersRoute(unauthReq);
      expect(unauthRes.status).toBe(401);

      const unauthData = await unauthRes.json();
      expect(unauthData.success).toBe(false);
      expect(unauthData.error).toContain('X-Vendor-Pin');

      // 3. Vendor Orders endpoint: authorize the valid staff PIN
      const authReq = new Request('http://localhost:3000/api/orders', {
        headers: { 'X-Vendor-Pin': TEST_VENDOR_PIN },
      });
      const authRes = await getOrdersRoute(authReq);
      expect(authRes.status).toBe(200);
      const authData = await authRes.json();
      expect(authData.success).toBe(true);
      expect(Array.isArray(authData.orders)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Zero-Secret Public Tracker Contract
  // --------------------------------------------------------------------------
  describe('5. Zero-Secret Public Tracker Contract', () => {
    it('GET /api/orders/[id]/public returns status and details, and asserts qrPayload, signatureBase64, and pinCode are undefined', async () => {
      // Create a test order with private security tokens
      const testOrderId = 'GP-2026-SECRET99';
      await db.createOrder({
        orderId: testOrderId,
        pinCode: '7412',
        customerId: 'cust-secret-test',
        ticketCode: 'GP-3820-X',
        isGroupOrder: true,
        seatNote: 'Fangio Stand Row D Seat 12',
        items: [
          { itemId: 'apex-burger', name: 'APEX BURGER', quantity: 2, unitPrice: 16.5 },
        ],
        subtotal: 33.0,
        discountAmount: 3.3,
        discountRate: '10% OFF',
        serviceFee: 0.74,
        total: 30.44,
        loyaltyPointsEarned: 61,
        pickupStationId: 'M2',
        pickupStationName: 'Pit Stop M2 (Turn 9 East)',
        counterNumber: '#03',
        walkTimeMins: 2,
        qrPayload: 'AGPC1.VERY_SECRET_ED25519_PAYLOAD_HERE',
        signatureBase64: 'VERY_SECRET_ED25519_SIGNATURE_BASE64',
        status: 'READY_FOR_PICKUP',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Call public tracker endpoint
      const req = new Request(`http://localhost:3000/api/orders/${testOrderId}/public`);
      const res = await getOrderPublicRoute(req, { params: Promise.resolve({ id: testOrderId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      const tracking = json.data;
      expect(tracking.orderId).toBe(testOrderId);
      expect(tracking.status).toBe('READY_FOR_PICKUP');
      expect(tracking.pickupStationId).toBe('M2');
      expect(tracking.counterNumber).toBe('#03');
      expect(tracking.isGroupOrder).toBe(true);
      expect(tracking.seatNote).toBe('Fangio Stand Row D Seat 12');

      // STRICT ZERO-SECRET AUDIT
      expect(tracking.qrPayload).toBeUndefined();
      expect(tracking.signatureBase64).toBeUndefined();
      expect(tracking.pinCode).toBeUndefined();

      // Top-level response audit as well
      expect(json.qrPayload).toBeUndefined();
      expect(json.signatureBase64).toBeUndefined();
      expect(json.pinCode).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Offline Sync Queue (syncQueue.ts)
  // --------------------------------------------------------------------------
  describe('6. Offline Sync Queue Outbox', () => {
    const memoryStore = new Map<string, string>();
    const originalWindow = global.window;
    const originalFetch = global.fetch;

    beforeEach(() => {
      memoryStore.clear();

      // Mock window and localStorage for Node test runner
      (global as unknown as { window: unknown }).window = {
        localStorage: {
          getItem: (key: string) => memoryStore.get(key) || null,
          setItem: (key: string, value: string) => memoryStore.set(key, value),
          removeItem: (key: string) => memoryStore.delete(key),
          clear: () => memoryStore.clear(),
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    });

    afterEach(() => {
      (global as unknown as { window: unknown }).window = originalWindow;
      global.fetch = originalFetch;
    });

    it('enqueues actions to syncQueue.ts and flushing resolves cleanly against status route', async () => {
      expect(getPendingSyncActions()).toEqual([]);

      // 1. Enqueue action
      const action = enqueueSyncAction({
        orderId: 'GP-2026-SYNC01',
        status: 'COMPLETED',
      });

      expect(action.id).toBeDefined();
      expect(action.orderId).toBe('GP-2026-SYNC01');
      expect(action.status).toBe('COMPLETED');
      expect(getPendingSyncActions().length).toBe(1);

      // 2. Mock fetch for status PATCH
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as unknown as Response);

      // 3. Flush queue
      const result = await flushSyncQueue(TEST_VENDOR_PIN);
      expect(result.resolved).toBe(1);
      expect(result.failed).toBe(0);

      // 4. Assert queue is now empty
      expect(getPendingSyncActions().length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Zod Schema Validation
  // --------------------------------------------------------------------------
  describe('7. Zod Request Schema Validation', () => {
    it('POST /api/orders rejects empty items with 400', async () => {
      const req = new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('POST /api/orders rejects non-positive item quantities with 400', async () => {
      const req = new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ itemId: 'apex-burger', quantity: -2 }],
        }),
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Quantity must be a positive integer');
    });

    it('POST /api/orders rejects malformed JSON with 400', async () => {
      const req = new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'NOT_VALID_JSON{',
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });
});
