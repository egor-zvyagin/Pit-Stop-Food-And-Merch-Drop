import * as crypto from 'crypto';

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

export interface SignedDigitalPass {
  payloadJson: string;     // Canonical JSON string
  signatureBase64: string; // 64-byte Ed25519 signature in Base64
  publicKeyId: string;     // Key identifier for active rotation keyrings
  qrPayload: string;       // Formatted string: AGPC1.<payloadBase64>.<sigBase64>
}

// Canonical default Ed25519 keypair for AGPC-2027-KEY-01 (deterministic SHA-256 seed fallback)
const DEFAULT_PRIVATE_KEY_PKCS8_BASE64 = 'MC4CAQAwBQYDK2VwBCIEIAb3jAxXlfcxpf8sLeX1PB030hkFhhNzmmytI9drOMjI';
const DEFAULT_PUBLIC_KEY_SPKI_BASE64 = 'MCowBQYDK2VwAyEAXTZ23IPCQi9z2B0U4g6wNDVqanRuS3goJ9ULNdegGMY=';

// In-memory keypair cache
let cachedKeypair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } | null = null;

/**
 * Retrieves or initializes the Ed25519 signing keypair.
 * If base64 keys are configured in environment variables, they are loaded.
 * Supports both 48-byte PKCS8 DER base64 and 32-byte raw seed base64.
 * Otherwise, falls back to the canonical default keypair.
 */
export function getKeypair(): { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } {
  if (cachedKeypair) {
    return cachedKeypair;
  }

  try {
    const privB64 = process.env.ED25519_PRIVATE_KEY_BASE64;
    const pubB64 = process.env.ED25519_PUBLIC_KEY_BASE64;

    if (privB64) {
      const privBuffer = Buffer.from(privB64, 'base64');
      let privDer: Buffer;

      if (privBuffer.length === 48) {
        // Full PKCS8 DER
        privDer = privBuffer;
      } else if (privBuffer.length === 32) {
        // Raw 32-byte seed: prepend standard Ed25519 PKCS8 DER header
        const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
        privDer = Buffer.concat([pkcs8Header, privBuffer]);
      } else {
        throw new Error(`Unexpected private key length: ${privBuffer.length} bytes`);
      }

      const privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });

      let publicKey: crypto.KeyObject;
      if (pubB64) {
        const pubBuffer = Buffer.from(pubB64, 'base64');
        let pubDer: Buffer;
        if (pubBuffer.length === 44) {
          pubDer = pubBuffer;
        } else if (pubBuffer.length === 32) {
          // Prepend Ed25519 SPKI DER header
          const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
          pubDer = Buffer.concat([spkiHeader, pubBuffer]);
        } else {
          pubDer = pubBuffer;
        }
        publicKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });
      } else {
        publicKey = crypto.createPublicKey(privateKey);
      }

      cachedKeypair = { publicKey, privateKey };
      return cachedKeypair;
    }
  } catch (e) {
    console.warn('Could not load Ed25519 keys from env, falling back to default keypair:', e);
  }

  // Load canonical default keypair
  const privDer = Buffer.from(DEFAULT_PRIVATE_KEY_PKCS8_BASE64, 'base64');
  const pubDer = Buffer.from(DEFAULT_PUBLIC_KEY_SPKI_BASE64, 'base64');
  const privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
  const publicKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });

  cachedKeypair = { publicKey, privateKey };
  return cachedKeypair;
}

/**
 * Produces a canonical, deterministic JSON representation of an order pass payload.
 * Eliminates key-ordering ambiguity to ensure consistent signature hashing.
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
 * Signs an order pass payload with the server Ed25519 private key.
 * Produces a SignedDigitalPass with qrPayload format:
 * AGPC1.<payloadBase64>.<sigBase64>
 */
export function issueSignedPass(
  payload: OrderPassPayload,
  keyId: string = process.env.ED25519_KEY_ID || 'AGPC-2027-KEY-01'
): SignedDigitalPass {
  const { privateKey } = getKeypair();
  const canonicalString = canonicalize(payload);
  const dataBuffer = Buffer.from(canonicalString, 'utf-8');

  // Sign using Ed25519 asymmetric algorithm (produces 64-byte signature)
  const signature = crypto.sign(null, dataBuffer, privateKey);
  const signatureBase64 = signature.toString('base64');

  // Compact URL-safe Base64 encoding for QR representation: AGPC1.<payloadBase64>.<sigBase64>
  const encodedPayload = Buffer.from(canonicalString, 'utf-8').toString('base64url');
  const encodedSig = signature.toString('base64url');
  const qrPayload = `AGPC1.${encodedPayload}.${encodedSig}`;

  return {
    payloadJson: canonicalString,
    signatureBase64,
    publicKeyId: keyId,
    qrPayload,
  };
}

export const signPass = issueSignedPass;

/**
 * Returns the public key in SPKI DER Base64 format.
 */
export function getPublicKeyBase64(): string {
  if (process.env.ED25519_PUBLIC_KEY_BASE64) {
    return process.env.ED25519_PUBLIC_KEY_BASE64;
  }
  const { publicKey } = getKeypair();
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  return Buffer.from(spkiDer).toString('base64');
}

/**
 * Returns the raw 32-byte public key in Base64 format.
 */
export function getRawPublicKeyBase64(): string {
  const { publicKey } = getKeypair();
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawBytes = spkiDer.subarray(spkiDer.length - 32);
  return Buffer.from(rawBytes).toString('base64');
}

export class Ed25519PassSigner {
  public static getKeypair = getKeypair;
  public static canonicalize = canonicalize;
  public static issueSignedPass = issueSignedPass;
  public static signPass = signPass;
  public static getPublicKeyBase64 = getPublicKeyBase64;
  public static getRawPublicKeyBase64 = getRawPublicKeyBase64;
}
