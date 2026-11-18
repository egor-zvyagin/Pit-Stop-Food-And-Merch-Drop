/**
 * Offline Nonce Registry for Vendor Terminals
 * Backed by localStorage with in-memory fallback for SSR and tests.
 * Mitigates replay attacks by tracking scanned order nonces and rejection of duplicates.
 */

export interface ScannedNonceRecord {
  nonce: string;
  orderId?: string;
  expiresAt: number;    // Epoch seconds
  scannedAt: number;    // Epoch milliseconds
}

export class OfflineNonceRegistry {
  private static readonly STORAGE_KEY = 'pitstop_scanned_nonces';
  private static memoryMap: Map<string, ScannedNonceRecord> = new Map();

  /**
   * Safely accesses localStorage across browser, SSR, or mock test environments.
   */
  private static getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
    return null;
  }

  /**
   * Loads records from localStorage into memory map.
   */
  public static loadRecords(): Map<string, ScannedNonceRecord> {
    const storage = this.getStorage();
    if (!storage) {
      return this.memoryMap;
    }
    try {
      const raw = storage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.memoryMap.clear();
          for (const item of parsed) {
            if (item && item.nonce) {
              this.memoryMap.set(item.nonce, item);
            }
          }
        }
      }
    } catch {
      // Fallback silently to memory
    }
    return this.memoryMap;
  }

  /**
   * Persists the current in-memory map to localStorage.
   */
  private static persist(): void {
    const storage = this.getStorage();
    if (!storage) return;
    try {
      const records = Array.from(this.memoryMap.values());
      storage.setItem(this.STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Ignore storage quota or permission errors
    }
  }

  /**
   * Registers a scanned nonce.
   * If the nonce has already been registered, returns { success: false, valid: false, reason: 'REPLAY_DETECTED' }.
   * If not previously scanned, records it and returns { success: true, valid: true }.
   */
  public static registerNonce(
    nonce: string,
    expiresAt: number,
    orderId?: string
  ): { success: boolean; valid: boolean; reason?: string } {
    this.loadRecords();
    this.pruneExpired();

    if (this.memoryMap.has(nonce)) {
      return {
        success: false,
        valid: false,
        reason: 'REPLAY_DETECTED',
      };
    }

    const record: ScannedNonceRecord = {
      nonce,
      orderId,
      expiresAt,
      scannedAt: Date.now(),
    };

    this.memoryMap.set(nonce, record);
    this.persist();

    return {
      success: true,
      valid: true,
    };
  }

  /**
   * Scans a nonce (alias for registerNonce).
   */
  public static scanNonce(
    nonce: string,
    expiresAt: number,
    orderId?: string
  ): { success: boolean; valid: boolean; reason?: string } {
    return this.registerNonce(nonce, expiresAt, orderId);
  }

  /**
   * Checks if a nonce has already been recorded without altering state.
   */
  public static isReplay(nonce: string): boolean {
    this.loadRecords();
    return this.memoryMap.has(nonce);
  }

  /**
   * Alias for isReplay.
   */
  public static has(nonce: string): boolean {
    return this.isReplay(nonce);
  }

  /**
   * Removes nonces that have exceeded their expiresAt epoch timestamp.
   */
  public static pruneExpired(currentEpochSeconds: number = Math.floor(Date.now() / 1000)): void {
    let changed = false;
    for (const [nonce, record] of Array.from(this.memoryMap.entries())) {
      if (record.expiresAt && currentEpochSeconds > record.expiresAt) {
        this.memoryMap.delete(nonce);
        changed = true;
      }
    }
    if (changed) {
      this.persist();
    }
  }

  /**
   * Clears all recorded nonces (primarily for test resets).
   */
  public static clear(): void {
    this.memoryMap.clear();
    const storage = this.getStorage();
    if (storage) {
      try {
        storage.removeItem(this.STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  }

  // Instance methods delegating to static methods
  public registerNonce(nonce: string, expiresAt: number, orderId?: string) {
    return OfflineNonceRegistry.registerNonce(nonce, expiresAt, orderId);
  }
  public scanNonce(nonce: string, expiresAt: number, orderId?: string) {
    return OfflineNonceRegistry.scanNonce(nonce, expiresAt, orderId);
  }
  public isReplay(nonce: string) {
    return OfflineNonceRegistry.isReplay(nonce);
  }
  public has(nonce: string) {
    return OfflineNonceRegistry.has(nonce);
  }
  public pruneExpired(currentEpochSeconds?: number) {
    return OfflineNonceRegistry.pruneExpired(currentEpochSeconds);
  }
  public clear() {
    return OfflineNonceRegistry.clear();
  }
}

export const offlineNonceRegistry = new OfflineNonceRegistry();
