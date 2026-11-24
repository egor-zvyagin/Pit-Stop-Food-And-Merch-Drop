/**
 * Isomorphic Browser-Safe Ed25519 Pass Verifier
 * Powered by @noble/curves with ZERO node:crypto dependencies.
 * Safely bundles into client-side Webpack packages without polyfill errors.
 */

import { ed25519 } from '@noble/curves/ed25519';

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderPassPayload {
  orderId: string;
  customerId: string;
  targetStationId: string;
  issuedAt: number;        // Epoch seconds
  expiresAt: number;       // Epoch seconds
  items: OrderItem[];
  nonce: string;           // Cryptographic random nonce for replay mitigation
}

export interface VerificationResult {
  isValid: boolean;
  orderId?: string;
  latencyMs: number;
  reason?: string;
  payload?: OrderPassPayload;
}

// Active in-memory public key for verification
let activePublicKeyBytes: Uint8Array | null = null;

// Precompute curve generator tables at module load with static valid vector so every verification meets < 10ms SLA
try {
  const WARMUP_PUB = base64ToBytes('nZ1MtP/Z/Tj3fEqyvGtaQx3u0y27OvhnyECi8z6fbJg=');
  const WARMUP_SIG = base64ToBytes('BwiSx0mPE7/M9yEA2YQmVg9giEeSVuHq3EdgZIV95NPpTzjNdbNmgXME2Q+s6u99YBNuiUke8sqzxlHNxAOqBQ==');
  const WARMUP_MSG = new Uint8Array([42]);
  ed25519.verify(WARMUP_SIG, WARMUP_MSG, WARMUP_PUB);
} catch {
  // Ignored
}

/**
 * Pure JavaScript Base64 / Base64URL decoder with zero Node.js dependencies.
 */
export function base64ToBytes(base64: string): Uint8Array {
  // Normalize base64url characters to standard base64
  const standard = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (standard.length % 4)) % 4;
  const padded = standard.padEnd(standard.length + padLength, '=');

  if (typeof atob !== 'undefined') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Fallback if Buffer is available
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }

  throw new Error('No Base64 decoding environment available');
}

/**
 * Pure JavaScript UTF-8 string decoder with zero Node.js dependencies.
 */
export function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

/**
 * Normalizes an Ed25519 public key (32-byte raw or 44-byte SPKI DER) into a 32-byte Uint8Array.
 */
export function normalizePublicKey(key: string | Uint8Array): Uint8Array {
  const bytes = typeof key === 'string' ? base64ToBytes(key) : key;
  if (bytes.length === 32) {
    return bytes;
  }
  if (bytes.length === 44) {
    // In 44-byte Ed25519 SPKI DER, the 32-byte raw public key starts at offset 12
    return bytes.subarray(12);
  }
  throw new Error(`Invalid Ed25519 public key length: ${bytes.length} bytes (expected 32 or 44)`);
}

/**
 * Explicitly sets the active Ed25519 public key used for offline verification.
 */
export function setVerificationPublicKey(publicKey: string | Uint8Array): void {
  activePublicKeyBytes = normalizePublicKey(publicKey);
}

/**
 * True once a verification key is available, either set explicitly or present
 * in the environment.
 */
export function hasVerificationPublicKey(): boolean {
  try {
    getActivePublicKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the active public key: the one set with setVerificationPublicKey(),
 * otherwise the one configured in the environment.
 *
 * There is deliberately no built-in default. A verifier that falls back to a
 * key published in the source code would accept passes anyone can forge.
 * Throws when no key is available; verifyPassOffline() reports that as an
 * invalid pass.
 */
export function getActivePublicKey(): Uint8Array {
  if (activePublicKeyBytes) {
    return activePublicKeyBytes;
  }

  const envKey =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_ED25519_PUBLIC_KEY) ||
    (typeof process !== 'undefined' && process.env?.ED25519_PUBLIC_KEY_BASE64);

  if (envKey) {
    activePublicKeyBytes = normalizePublicKey(envKey);
    return activePublicKeyBytes;
  }

  throw new Error('Verification key not loaded. Connect this terminal to the network once to fetch it.');
}

/**
 * Produces a canonical, deterministic JSON representation of an order pass payload.
 */
export function canonicalize(payload: OrderPassPayload): string {
  return JSON.stringify({
    customerId: payload.customerId,
    expiresAt: payload.expiresAt,
    issuedAt: payload.issuedAt,
    items: payload.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      sku: item.sku,
      unitPriceCents: item.unitPriceCents,
    })),
    nonce: payload.nonce,
    orderId: payload.orderId,
    targetStationId: payload.targetStationId,
  });
}

/**
 * High-precision cross-platform monotonic timer.
 */
function getTimestampMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Verifies a pass offline using Ed25519 public key cryptographic verification.
 * Zero network connectivity, zero cloud API calls, guaranteed sub-10ms SLA.
 */
export function verifyPassOffline(
  pass: { payloadJson: string; signatureBase64: string | Uint8Array },
  currentStationId: string = 'ALL',
  currentEpochSeconds?: number,
  publicKey?: string | Uint8Array
): VerificationResult {
  const startMs = getTimestampMs();

  try {
    const rawPubKey = publicKey ? normalizePublicKey(publicKey) : getActivePublicKey();
    const signatureBytes =
      pass.signatureBase64 instanceof Uint8Array
        ? pass.signatureBase64
        : base64ToBytes(pass.signatureBase64);

    if (signatureBytes.length !== 64) {
      const latencyMs = getTimestampMs() - startMs;
      return {
        isValid: false,
        latencyMs,
        reason: 'Cryptographic Signature Invalid: Payload was altered or signature forged.',
      };
    }

    const payloadBytes =
      typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(pass.payloadJson)
        : new Uint8Array(Array.from(pass.payloadJson).map((c) => c.charCodeAt(0)));

    // 1. Cryptographic Signature Verification using @noble/curves ed25519
    const isSignatureValid = ed25519.verify(signatureBytes, payloadBytes, rawPubKey);
    if (!isSignatureValid) {
      const latencyMs = getTimestampMs() - startMs;
      return {
        isValid: false,
        latencyMs,
        reason: 'Cryptographic Signature Invalid: Payload was altered or signature forged.',
      };
    }

    // 2. Parse Canonical Payload
    const parsed: OrderPassPayload = JSON.parse(pass.payloadJson);
    const nowEpoch = currentEpochSeconds ?? Math.floor(Date.now() / 1000);

    // 3. Expiration Check
    if (nowEpoch > parsed.expiresAt) {
      const latencyMs = getTimestampMs() - startMs;
      return {
        isValid: false,
        orderId: parsed.orderId,
        latencyMs,
        reason: `Pass Expired: Expired at ${parsed.expiresAt}, current time is ${nowEpoch}.`,
      };
    }

    // 4. Station Boundary Check
    if (
      currentStationId !== 'ALL' &&
      parsed.targetStationId !== 'ALL' &&
      parsed.targetStationId !== currentStationId
    ) {
      const latencyMs = getTimestampMs() - startMs;
      return {
        isValid: false,
        orderId: parsed.orderId,
        latencyMs,
        reason: `Incorrect Concession Pod: Assigned to ${parsed.targetStationId}, scanned at ${currentStationId}.`,
      };
    }

    const latencyMs = getTimestampMs() - startMs;
    return {
      isValid: true,
      orderId: parsed.orderId,
      latencyMs,
      payload: parsed,
    };
  } catch (err: unknown) {
    const latencyMs = getTimestampMs() - startMs;
    const errorMsg = err instanceof Error ? err.message : 'Unknown validation failure';
    return {
      isValid: false,
      latencyMs,
      reason: `Verification Exception: ${errorMsg}`,
    };
  }
}

export const verifyPass = verifyPassOffline;

/**
 * Parses and verifies a raw QR payload string.
 * Supports both:
 * - AGPC1.<payloadBase64>.<sigBase64> (3 parts)
 * - AGPC1.<keyId>.<payloadBase64>.<sigBase64> (4 parts)
 */
export function verifyQrPayload(
  qrString: string,
  currentStationId: string = 'ALL',
  currentEpochSeconds?: number,
  publicKey?: string | Uint8Array
): VerificationResult {
  try {
    const parts = qrString.split('.');
    let payloadEncoded: string;
    let signatureEncoded: string;

    if (parts.length === 3 && parts[0] === 'AGPC1') {
      payloadEncoded = parts[1];
      signatureEncoded = parts[2];
    } else if (parts.length === 4 && parts[0] === 'AGPC1') {
      payloadEncoded = parts[2];
      signatureEncoded = parts[3];
    } else {
      return {
        isValid: false,
        latencyMs: 0,
        reason: 'Malformed QR payload scheme: expected AGPC1 format',
      };
    }

    const payloadBytes = base64ToBytes(payloadEncoded);
    const payloadJson = bytesToUtf8(payloadBytes);
    const signatureBytes = base64ToBytes(signatureEncoded);

    return verifyPassOffline(
      { payloadJson, signatureBase64: signatureBytes },
      currentStationId,
      currentEpochSeconds,
      publicKey
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid QR format';
    return {
      isValid: false,
      latencyMs: 0,
      reason: `QR Parse Error: ${errorMsg}`,
    };
  }
}

export class Ed25519PassVerifier {
  public static verifyPass = verifyPassOffline;
  public static verifyPassOffline = verifyPassOffline;
  public static verifyQrPayload = verifyQrPayload;
  public static canonicalize = canonicalize;
  public static setVerificationPublicKey = setVerificationPublicKey;
  public static getActivePublicKey = getActivePublicKey;
}
