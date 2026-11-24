import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Locker bays are claimed in the same transaction as the order, so two orders
 * placed at the same moment never share a bay, and a collected order frees
 * its bay for the next one.
 */

describe('locker bay claims (in-memory store)', () => {
  it('gives simultaneous orders at one pod different bays', async () => {
    const { POST } = await import('@/app/api/orders/route');
    const place = () =>
      POST(
        new Request('http://localhost/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ itemId: 'still-water', quantity: 1 }], stationId: 'M4', ticketCode: 'GP-9014-P' }),
        })
      );

    const responses = await Promise.all(Array.from({ length: 6 }, place));
    const bays = await Promise.all(responses.map(async (r) => (await r.json()).order.counterNumber as string));

    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(new Set(bays).size).toBe(6);
    bays.forEach((bay) => expect(bay).toMatch(/^#0[1-8]$/));
  });

  it('frees a bay when its order is collected', async () => {
    const { db, LockerTakenError } = await import('@/lib/db/client');
    const base = {
      ticketCode: 'GP-9014-P',
      customerId: 'TICKET-GP-9014-P',
      status: 'RECEIVED' as const,
      pickupStationId: 'M3',
      pickupStationName: 'Pit Stop M3',
      counterNumber: '#07',
      walkTimeMins: 5,
      items: [{ itemId: 'still-water', name: 'Spring water', quantity: 1, unitPrice: 4.5 }],
      subtotal: 4.5,
      discountAmount: 0,
      total: 4.5,
      loyaltyPointsEarned: 9,
      qrPayload: 'AGPC1.TEST',
      signatureBase64: 'TEST',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.createOrderAtomic({ ...base, orderId: 'GP-2026-LOCK01', pinCode: '1111' } as any, { 'still-water': 1 });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.createOrderAtomic({ ...base, orderId: 'GP-2026-LOCK02', pinCode: '2222' } as any, { 'still-water': 1 })
    ).rejects.toBeInstanceOf(LockerTakenError);

    await db.updateOrderStatus('GP-2026-LOCK01', 'COMPLETED');
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.createOrderAtomic({ ...base, orderId: 'GP-2026-LOCK03', pinCode: '3333' } as any, { 'still-water': 1 })
    ).resolves.toMatchObject({ counterNumber: '#07' });
  });
});

describe('locker bay claims (DynamoDB)', () => {
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    send = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.doUnmock('@aws-sdk/lib-dynamodb');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function loadDb() {
    vi.resetModules();
    vi.stubEnv('USE_LOCAL_STORAGE', 'false');
    vi.doMock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
      return { ...actual, DynamoDBDocumentClient: { from: () => ({ send }) } };
    });
    return import('@/lib/db/client');
  }

  const ORDER = {
    orderId: 'GP-2026-DDB001',
    ticketCode: 'GP-3820-X',
    customerId: 'TICKET-GP-3820-X',
    pinCode: '4821',
    status: 'RECEIVED' as const,
    pickupStationId: 'M1',
    pickupStationName: 'Pit Stop M1',
    counterNumber: '#03',
    walkTimeMins: 1,
    items: [{ itemId: 'still-water', name: 'Spring water', quantity: 1, unitPrice: 4.5 }],
    subtotal: 4.5,
    discountAmount: 0,
    total: 4.5,
    loyaltyPointsEarned: 9,
    qrPayload: 'AGPC1.TEST',
    signatureBase64: 'TEST',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('claims the bay in the same transaction as the order', async () => {
    send.mockResolvedValue({});
    const { db } = await loadDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.createOrderAtomic(ORDER as any, { 'still-water': 1 });

    const tx = send.mock.calls[0][0];
    const items = tx.input.TransactItems as Array<{ Put?: { Item: Record<string, unknown>; ConditionExpression: string } }>;
    const claim = items.find((i) => i.Put?.Item.PK === 'LOCKER#M1##03');
    expect(claim?.Put?.Item.orderId).toBe('GP-2026-DDB001');
    expect(claim?.Put?.ConditionExpression).toBe('attribute_not_exists(PK)');
  });

  it('reports a taken bay, not missing stock, when only the claim fails', async () => {
    // Transaction order: stock update, locker claim, order put.
    send.mockRejectedValueOnce(
      Object.assign(new Error('Transaction cancelled'), {
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
      })
    );
    const { db, LockerTakenError } = await loadDb();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.createOrderAtomic(ORDER as any, { 'still-water': 1 })
    ).rejects.toBeInstanceOf(LockerTakenError);
  });
});
