/**
 * Pit Stop v3: Offline Fulfillment Sync Queue
 * Manages a localStorage-persisted outbox of OfflineSyncAction[] for the vendor kiosk.
 * Includes in-memory fallback for SSR and test execution.
 * Key: pitstop_vendor_sync_queue_v1
 */

import { OfflineSyncAction } from '@/lib/types';

export const SYNC_QUEUE_STORAGE_KEY = 'pitstop_vendor_sync_queue_v1';

// In-memory fallback for environments without localStorage (SSR / unit tests)
let memoryQueue: OfflineSyncAction[] = [];

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (
    typeof globalThis !== 'undefined' &&
    (globalThis as unknown as { localStorage?: Storage }).localStorage
  ) {
    return (globalThis as unknown as { localStorage: Storage }).localStorage;
  }
  return null;
}

function readQueue(): OfflineSyncAction[] {
  const storage = getStorage();
  if (!storage) {
    return [...memoryQueue];
  }
  try {
    const raw = storage.getItem(SYNC_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    memoryQueue = list;
    return list;
  } catch {
    return [...memoryQueue];
  }
}

function writeQueue(queue: OfflineSyncAction[]): void {
  memoryQueue = [...queue];
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage quota exceeded or disabled – best-effort
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resets the sync queue in storage and memory (useful for testing).
 */
export function clearSyncQueue(): void {
  memoryQueue = [];
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(SYNC_QUEUE_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Adds a new action to the sync outbox.
 */
export function enqueueSyncAction(
  action: Omit<OfflineSyncAction, 'id' | 'queuedAt' | 'attempts'>
): OfflineSyncAction {
  const queue = readQueue();

  const entry: OfflineSyncAction = {
    ...action,
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  queue.push(entry);
  writeQueue(queue);
  return entry;
}

/**
 * Returns all queued actions (pending sync to the server).
 */
export function getPendingSyncActions(): OfflineSyncAction[] {
  return readQueue();
}

/**
 * Removes a single action from the queue by id.
 */
export function removeSyncAction(id: string): void {
  const queue = readQueue().filter((a) => a.id !== id);
  writeQueue(queue);
}

/**
 * Attempts to flush every queued action against the live API.
 *  - On 200 OK or 409 (order already completed) → remove from queue.
 *  - On network error or non-200/409 → increment attempts, persist lastError.
 *
 * Returns { resolved, failed } counts.
 */
export async function flushSyncQueue(
  vendorPin: string
): Promise<{ resolved: number; failed: number }> {
  let resolved = 0;
  let failed = 0;

  const queue = readQueue();
  if (queue.length === 0) return { resolved: 0, failed: 0 };

  for (const action of queue) {
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(action.orderId)}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Vendor-Pin': vendorPin,
          },
          body: JSON.stringify({ status: action.status }),
        }
      );

      if (res.ok || res.status === 409) {
        // 200 success OR 409 means already at target/completed state – dequeue
        removeSyncAction(action.id);
        resolved++;
      } else {
        // Increment attempts and persist error message
        const current = readQueue();
        const updated = current.map((a) =>
          a.id === action.id
            ? { ...a, attempts: a.attempts + 1, lastError: `HTTP ${res.status}` }
            : a
        );
        writeQueue(updated);
        failed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      const current = readQueue();
      const updated = current.map((a) =>
        a.id === action.id
          ? { ...a, attempts: a.attempts + 1, lastError: msg }
          : a
      );
      writeQueue(updated);
      failed++;
    }
  }

  return { resolved, failed };
}

/**
 * Attaches an `online` listener across browser or global dispatcher environments.
 * Calls onOnline() when connectivity returns.
 * Returns a cleanup function.
 */
export function listenToOnlineStatus(onOnline: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }

  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as unknown as EventTarget).addEventListener === 'function'
  ) {
    const target = globalThis as unknown as EventTarget;
    target.addEventListener('online', onOnline);
    return () => {
      target.removeEventListener('online', onOnline);
    };
  }

  return () => {};
}
