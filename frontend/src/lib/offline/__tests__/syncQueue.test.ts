import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueueSyncAction,
  getPendingSyncActions,
  removeSyncAction,
  flushSyncQueue,
  listenToOnlineStatus,
  clearSyncQueue,
} from '../syncQueue';

describe('Offline Fulfillment Sync Queue', () => {
  beforeEach(() => {
    clearSyncQueue();
    vi.restoreAllMocks();
  });

  it('enqueues actions and persists them to outbox', () => {
    const action = enqueueSyncAction({
      orderId: 'GP-2026-TEST01',
      status: 'READY_FOR_PICKUP',
      nonce: 'nonce-1234',
    });

    expect(action.id).toMatch(/^sync-/);
    expect(action.orderId).toBe('GP-2026-TEST01');
    expect(action.status).toBe('READY_FOR_PICKUP');
    expect(action.attempts).toBe(0);
    expect(action.queuedAt).toBeDefined();

    const pending = getPendingSyncActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].orderId).toBe('GP-2026-TEST01');
  });

  it('removes actions by id', () => {
    const a1 = enqueueSyncAction({ orderId: 'GP-01', status: 'PREPARING' });
    const a2 = enqueueSyncAction({ orderId: 'GP-02', status: 'COMPLETED' });

    expect(getPendingSyncActions()).toHaveLength(2);

    removeSyncAction(a1.id);
    const remaining = getPendingSyncActions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(a2.id);
  });

  it('flushes sync queue successfully when server returns 200', async () => {
    enqueueSyncAction({ orderId: 'GP-SUCCESS', status: 'COMPLETED' });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as unknown as Response);

    const result = await flushSyncQueue('2026');
    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);
    expect(getPendingSyncActions()).toHaveLength(0);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/orders/GP-SUCCESS/status',
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Pin': '2026',
        },
      })
    );
  });

  it('dequeues action on 409 Conflict (order already completed)', async () => {
    enqueueSyncAction({ orderId: 'GP-ALREADY-DONE', status: 'COMPLETED' });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: 'Order already completed' }),
    } as unknown as Response);

    const result = await flushSyncQueue('2026');
    expect(result.resolved).toBe(1);
    expect(result.failed).toBe(0);
    expect(getPendingSyncActions()).toHaveLength(0);
  });

  it('increments attempts and preserves action on network error', async () => {
    enqueueSyncAction({ orderId: 'GP-FAIL', status: 'COMPLETED' });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network Offline'));

    const result = await flushSyncQueue('2026');
    expect(result.resolved).toBe(0);
    expect(result.failed).toBe(1);

    const pending = getPendingSyncActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(1);
    expect(pending[0].lastError).toBe('Network Offline');
  });

  it('attaches online event listener and returns cleanup function', () => {
    let triggered = false;
    const cleanup = listenToOnlineStatus(() => {
      triggered = true;
    });

    expect(typeof cleanup).toBe('function');
    if (typeof globalThis.dispatchEvent === 'function') {
      globalThis.dispatchEvent(new Event('online'));
      expect(triggered).toBe(true);

      triggered = false;
      cleanup();
      globalThis.dispatchEvent(new Event('online'));
      expect(triggered).toBe(false);
    }
  });
});
