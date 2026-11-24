import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * With DynamoDB configured, the in-memory store must play no part: a failing
 * database is reported as a failure, and reads come from the table rather than
 * from a copy held in one server process.
 *
 * The AWS SDK document client is replaced with a stub, so no network is used.
 */

type SentCommand = { constructor: { name: string }; input: Record<string, unknown> };
let send: ReturnType<typeof vi.fn>;

async function loadDynamoBackedDb() {
  vi.resetModules();
  vi.stubEnv('USE_LOCAL_STORAGE', 'false');
  vi.doMock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
    return {
      ...actual,
      DynamoDBDocumentClient: { from: () => ({ send }) },
    };
  });
  return import('@/lib/db/client');
}

const ORDER_INPUT = {
  orderId: 'GP-2026-FAIL01',
  ticketCode: 'GP-3820-X',
  customerId: 'TICKET-GP-3820-X',
  pinCode: '4821',
  status: 'RECEIVED' as const,
  pickupStationId: 'M1',
  pickupStationName: 'PIT STOP M1',
  counterNumber: '#01',
  walkTimeMins: 1,
  items: [{ itemId: 'still-water', name: 'Still Water', quantity: 1, unitPrice: 4, lineTotal: 4 }],
  subtotal: 4,
  discountAmount: 0,
  total: 4,
  loyaltyPointsEarned: 8,
  qrPayload: 'AGPC1.TEST',
  signatureBase64: 'TEST',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  send = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.doUnmock('@aws-sdk/lib-dynamodb');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('when DynamoDB is failing', () => {
  beforeEach(() => {
    send.mockRejectedValue(Object.assign(new Error('socket hang up'), { name: 'TimeoutError' }));
  });

  it('does not pretend an order was created', async () => {
    const { db, DatabaseUnavailableError } = await loadDynamoBackedDb();

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.createOrderAtomic(ORDER_INPUT as any, { 'still-water': 1 })
    ).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it('does not answer reads from memory', async () => {
    const { db, DatabaseUnavailableError } = await loadDynamoBackedDb();

    await expect(db.getItems()).rejects.toBeInstanceOf(DatabaseUnavailableError);
    await expect(db.getStations()).rejects.toBeInstanceOf(DatabaseUnavailableError);
    await expect(db.getCircuitState()).rejects.toBeInstanceOf(DatabaseUnavailableError);
    await expect(db.getOrderById('GP-2026-X9K2P4')).rejects.toBeInstanceOf(DatabaseUnavailableError);
    await expect(db.getOrdersByTicket('GP-3820-X')).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it('does not report a status change that was never stored', async () => {
    const { db, DatabaseUnavailableError } = await loadDynamoBackedDb();
    await expect(db.updateOrderStatus('GP-2026-X9K2P4', 'COMPLETED')).rejects.toBeInstanceOf(
      DatabaseUnavailableError
    );
  });

  it('still reports a sold-out item as a stock conflict, not an outage', async () => {
    send.mockImplementation(async (command: SentCommand) => {
      if (command.constructor.name === 'TransactWriteCommand') {
        throw Object.assign(new Error('Transaction cancelled: ConditionalCheckFailed'), {
          name: 'TransactionCanceledException',
        });
      }
      return { Item: { stock: 0 } };
    });
    const { db, InsufficientStockError } = await loadDynamoBackedDb();

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.createOrderAtomic(ORDER_INPUT as any, { 'still-water': 1 })
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });
});

describe('when DynamoDB is healthy', () => {
  it('reads an order from the table with a consistent read, never from memory', async () => {
    const stored = { ...ORDER_INPUT, orderId: 'GP-2026-X9K2P4', status: 'PREPARING' };
    send.mockResolvedValue({ Item: stored });
    const { db } = await loadDynamoBackedDb();

    // The in-memory seed holds an order with this ID in a different state.
    const order = await db.getOrderById('gp-2026-x9k2p4');
    expect(order?.status).toBe('PREPARING');

    const command = send.mock.calls[0][0] as SentCommand;
    expect(command.constructor.name).toBe('GetCommand');
    expect(command.input.ConsistentRead).toBe(true);
  });

  it('treats a missing order as missing', async () => {
    send.mockResolvedValue({});
    const { db } = await loadDynamoBackedDb();
    expect(await db.getOrderById('GP-2026-X9K2P4')).toBeUndefined();
  });

  it('returns the stored record after a status update', async () => {
    send.mockImplementation(async (command: SentCommand) =>
      command.constructor.name === 'GetCommand'
        ? { Item: { ...ORDER_INPUT, status: 'READY_FOR_PICKUP' } }
        : {}
    );
    const { db } = await loadDynamoBackedDb();

    const updated = await db.updateOrderStatus(ORDER_INPUT.orderId, 'READY_FOR_PICKUP');
    expect(updated?.status).toBe('READY_FOR_PICKUP');
    expect(send.mock.calls.map(([c]) => (c as SentCommand).constructor.name)).toEqual([
      'UpdateCommand',
      'GetCommand',
    ]);
  });

  it('returns no orders, not everyone\'s, for a ticket that has none', async () => {
    send.mockResolvedValue({ Items: [] });
    const { db } = await loadDynamoBackedDb();
    expect(await db.getOrders('GP-0000-Z')).toEqual([]);
    expect(await db.getOrdersByTicket('GP-0000-Z')).toEqual([]);
  });
});
