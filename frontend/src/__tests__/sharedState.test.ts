import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '@/lib/validation/rateLimit';

/**
 * State that must hold across server instances: per-client rate limits,
 * payment idempotency keys and loyalty-point awards.
 */

const from = (ip: string) => ({ headers: new Headers({ 'x-forwarded-for': `${ip}, 10.0.0.1` }) });

describe('per-client rate limiting', () => {
  beforeEach(() => vi.stubEnv('RATE_LIMIT_IN_TESTS', '1'));
  afterEach(() => vi.unstubAllEnvs());

  it('limits a busy client without blocking anyone else', () => {
    const limiter = createRateLimiter('orders');
    const results = Array.from({ length: 12 }, () => limiter.consume(from('203.0.113.7')).allowed);
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results.slice(10).some((ok) => !ok)).toBe(true);

    expect(limiter.consume(from('198.51.100.20')).allowed).toBe(true);
  });

  it('answers 429 with Retry-After when a client is over the limit', async () => {
    const limiter = createRateLimiter('orders');
    let last;
    for (let i = 0; i < 12; i++) last = limiter.consume(from('203.0.113.8'));
    expect(last?.allowed).toBe(false);
    expect(last?.response?.status).toBe(429);
    expect(last?.response?.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('with DynamoDB', () => {
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

  it('returns the first saved response when another instance saved the key first', async () => {
    const first = { statusCode: 200, payload: { transactionId: 'TXN-FIRST' } };
    send.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'PutCommand') {
        throw Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' });
      }
      return { Item: { statusCode: 200, payload: first.payload } };
    });
    const { db } = await loadDb();

    const saved = await db.saveIdempotentResponse('PAYMENT#GP-2026-ABC123', 'key-1', {
      statusCode: 200,
      payload: { transactionId: 'TXN-SECOND' },
    });
    expect(saved.payload.transactionId).toBe('TXN-FIRST');
  });

  it('does not award points twice for the same order', async () => {
    const ticket = { PK: 'TICKET#GP-3820-X', SK: 'PROFILE', ticketCode: 'GP-3820-X', holderName: 'Alex', loyaltyPoints: 100, loyaltyTier: 'Bronze Fan' };
    send.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'GetCommand') return { Item: ticket };
      if (cmd.constructor.name === 'PutCommand') {
        throw Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' });
      }
      if (cmd.constructor.name === 'TransactWriteCommand') {
        throw Object.assign(new Error('cancelled'), {
          name: 'TransactionCanceledException',
          CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
        });
      }
      return {};
    });
    const { db } = await loadDb();

    const result = await db.awardTicketPoints('GP-3820-X', 50, 'GP-2026-ABC123');
    expect(result).toEqual({ success: true, pointsAwarded: 0, newTotal: 100 });

    const tx = send.mock.calls.map((c) => c[0]).find((c) => c.constructor.name === 'TransactWriteCommand');
    const [marker, add] = tx.input.TransactItems;
    expect(marker.Put.Item.PK).toBe('AWARD#GP-3820-X#GP-2026-ABC123');
    expect(add.Update.UpdateExpression).toBe('ADD loyaltyPoints :p');
  });
});
