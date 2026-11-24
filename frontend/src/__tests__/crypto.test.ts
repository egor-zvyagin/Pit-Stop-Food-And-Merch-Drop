import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { issueSignedPass, getKeypair, getPublicKeyBase64, OrderPassPayload } from '@/lib/crypto/passSigner';
import { verifyPassOffline, verifyQrPayload, getActivePublicKey } from '@/lib/crypto/passVerifier';
import { OfflineNonceRegistry } from '@/lib/crypto/nonceRegistry';

describe('Ed25519 Pass Signer & Isomorphic Verifier Suite', () => {
  const nowEpoch = Math.floor(Date.now() / 1000);

  const samplePayload: OrderPassPayload = {
    orderId: 'GP-2026-TEST01',
    customerId: 'TICKET-GP-3820-X',
    targetStationId: 'M1',
    issuedAt: nowEpoch,
    expiresAt: nowEpoch + 3600,
    items: [
      { sku: 'apex-burger', name: 'APEX BURGER', quantity: 2, unitPriceCents: 1650 },
      { sku: 'still-water', name: 'Spring water', quantity: 1, unitPriceCents: 450 },
    ],
    nonce: 'test-crypto-nonce-882194',
  };

  beforeAll(() => {
    // Warm up cryptographic curve point tables and active public key
    const warmSigned = issueSignedPass(samplePayload);
    verifyPassOffline(warmSigned, 'M1', nowEpoch);
  });

  beforeEach(() => {
    OfflineNonceRegistry.clear();
  });

  it('initializes Ed25519 keypair and active public key properly', () => {
    const keys = getKeypair();
    expect(keys.privateKey).toBeDefined();
    expect(keys.publicKey).toBeDefined();

    const pubKeyBase64 = getPublicKeyBase64();
    expect(typeof pubKeyBase64).toBe('string');
    expect(pubKeyBase64.length).toBeGreaterThan(30);

    const activeBytes = getActivePublicKey();
    expect(activeBytes).toBeInstanceOf(Uint8Array);
    expect(activeBytes.length).toBe(32);
  });

  it('issues a cryptographically signed pass and QR payload with Ed25519', () => {
    const signed = issueSignedPass(samplePayload);
    expect(signed.signatureBase64).toBeDefined();
    expect(signed.payloadJson).toBeDefined();
    expect(signed.qrPayload).toBeDefined();
    expect(signed.qrPayload.startsWith('AGPC1.')).toBe(true);
  });

  it('verifies valid pass offline with < 10ms SLA target (typical < 0.2ms)', () => {
    const signed = issueSignedPass(samplePayload);
    const result = verifyPassOffline(signed, 'M1', nowEpoch);

    expect(result.isValid).toBe(true);
    expect(result.orderId).toBe(samplePayload.orderId);
    expect(result.payload?.customerId).toBe(samplePayload.customerId);
    expect(result.latencyMs).toBeLessThan(10.0);
  });

  it('verifies raw QR payload string using verifyQrPayload', () => {
    const signed = issueSignedPass(samplePayload);
    const result = verifyQrPayload(signed.qrPayload, 'M1', nowEpoch);

    expect(result.isValid).toBe(true);
    expect(result.orderId).toBe(samplePayload.orderId);
    expect(result.latencyMs).toBeLessThan(10.0);
  });

  it('rejects tampered payload data with cryptographic integrity failure', () => {
    const signed = issueSignedPass(samplePayload);
    // Tamper with order quantity: change 2 to 99
    const tamperedPayload = signed.payloadJson.replace('"quantity":2', '"quantity":99');
    const tamperedPass = { ...signed, payloadJson: tamperedPayload };

    const result = verifyPassOffline(tamperedPass, 'M1', nowEpoch);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Cryptographic Signature Invalid');
  });

  it('rejects forged or corrupted signatures', () => {
    const signed = issueSignedPass(samplePayload);
    // Overwrite signature with 64 zero bytes
    const forgedSignature = Buffer.alloc(64).toString('base64');
    const forgedPass = { ...signed, signatureBase64: forgedSignature };

    const result = verifyPassOffline(forgedPass, 'M1', nowEpoch);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Cryptographic Signature Invalid');
  });

  it('rejects expired passes based on epoch timestamp', () => {
    const expiredPayload: OrderPassPayload = {
      ...samplePayload,
      issuedAt: nowEpoch - 7200,
      expiresAt: nowEpoch - 60, // Expired 1 minute ago
      nonce: 'expired-test-nonce-123',
    };
    const signed = issueSignedPass(expiredPayload);

    const result = verifyPassOffline(signed, 'M1', nowEpoch);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Pass Expired');
  });

  it('rejects concession pod station mismatch', () => {
    const signed = issueSignedPass(samplePayload); // Target pod is M1
    const result = verifyPassOffline(signed, 'M4', nowEpoch); // Scanned at M4

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Incorrect Concession Pod');
  });

  it('satisfies high-throughput SLA: benchmark 100 iterations verifying latency is < 10ms', () => {
    const signed = issueSignedPass(samplePayload);
    const iterations = 100;
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const res = verifyPassOffline(signed, 'M1', nowEpoch);
      expect(res.isValid).toBe(true);
      latencies.push(res.latencyMs);
    }

    // Assert the documented 10 ms SLA on the average and the median. A hard
    // limit on the single slowest run, or a tighter machine-speed target,
    // fails on a busy CI runner without the code being any slower.
    const avgLatency = latencies.reduce((sum, ms) => sum + ms, 0) / iterations;
    const medianLatency = [...latencies].sort((a, b) => a - b)[Math.floor(iterations / 2)];
    expect(avgLatency).toBeLessThan(10.0);
    expect(medianLatency).toBeLessThan(10.0);
  });
});

describe('OfflineNonceRegistry Replay Attack Prevention', () => {
  beforeEach(() => {
    OfflineNonceRegistry.clear();
  });

  it('allows initial scan of a fresh nonce and rejects duplicate scans with REPLAY_DETECTED', () => {
    const nonce = 'unique-replay-test-nonce-992';
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;

    // First scan must succeed
    const firstScan = OfflineNonceRegistry.registerNonce(nonce, expiresAt, 'GP-2026-N1');
    expect(firstScan.success).toBe(true);
    expect(firstScan.valid).toBe(true);
    expect(OfflineNonceRegistry.isReplay(nonce)).toBe(true);

    // Second scan with identical nonce must fail with REPLAY_DETECTED
    const secondScan = OfflineNonceRegistry.registerNonce(nonce, expiresAt, 'GP-2026-N1');
    expect(secondScan.success).toBe(false);
    expect(secondScan.valid).toBe(false);
    expect(secondScan.reason).toBe('REPLAY_DETECTED');
  });

  it('prunes expired nonces after their validity window has passed', () => {
    const oldNonce = 'old-expired-nonce-001';
    const currentEpoch = Math.floor(Date.now() / 1000);

    // Register an already expired nonce
    OfflineNonceRegistry.registerNonce(oldNonce, currentEpoch - 10, 'GP-2026-OLD');
    expect(OfflineNonceRegistry.isReplay(oldNonce)).toBe(true);

    // Prune with current epoch
    OfflineNonceRegistry.pruneExpired(currentEpoch);
    expect(OfflineNonceRegistry.isReplay(oldNonce)).toBe(false);
  });
});
