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

// Keypair cache. Held on globalThis so every route bundle in one server
// process shares the same key (Next.js dev mode can load this module more
// than once).
type Ed25519Keypair = { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
const globalKeyStore = globalThis as unknown as { __pitstopEd25519Keypair?: Ed25519Keypair };

/**
 * Builds a keypair from ED25519_PRIVATE_KEY_BASE64 (and, optionally,
 * ED25519_PUBLIC_KEY_BASE64). Accepts 48-byte PKCS8 DER or a 32-byte raw seed
 * for the private key, and 44-byte SPKI DER or 32 raw bytes for the public key.
 * Throws if a configured key is malformed: a bad key is a deployment error and
 * must never be papered over with a substitute.
 */
function loadKeypairFromEnv(privB64: string, pubB64?: string): Ed25519Keypair {
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
    throw new Error(
      `ED25519_PRIVATE_KEY_BASE64 has an unexpected length (${privBuffer.length} bytes; expected 48 or 32)`
    );
  }

  const privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });

  if (!pubB64) {
    return { privateKey, publicKey: crypto.createPublicKey(privateKey) };
  }

  const pubBuffer = Buffer.from(pubB64, 'base64');
  // Prepend the Ed25519 SPKI DER header when given 32 raw bytes
  const pubDer =
    pubBuffer.length === 32
      ? Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pubBuffer])
      : pubBuffer;
  const publicKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });

  // The two variables must describe the same keypair, or every pass this
  // server signs would fail verification at the kiosk.
  const derived = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  if (!derived.equals(publicKey.export({ type: 'spki', format: 'der' }))) {
    throw new Error('ED25519_PUBLIC_KEY_BASE64 does not match ED25519_PRIVATE_KEY_BASE64');
  }
  return { privateKey, publicKey };
}

/**
 * Returns the Ed25519 signing keypair.
 *
 * - With ED25519_PRIVATE_KEY_BASE64 set, that key is used.
 * - Without it, `next dev` and the test runner (NODE_ENV "development" or
 *   "test") get a throwaway keypair generated for this process only.
 * - Anywhere else (production, scripts) a missing key is a hard error. There
 *   is no built-in default key: a key that ships in the source code is public,
 *   and anyone could use it to forge passes.
 */
export function getKeypair(): Ed25519Keypair {
  if (globalKeyStore.__pitstopEd25519Keypair) {
    return globalKeyStore.__pitstopEd25519Keypair;
  }

  const privB64 = process.env.ED25519_PRIVATE_KEY_BASE64;
  let keypair: Ed25519Keypair;

  if (privB64) {
    keypair = loadKeypairFromEnv(privB64, process.env.ED25519_PUBLIC_KEY_BASE64);
  } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    keypair = crypto.generateKeyPairSync('ed25519');
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[pass-signer] ED25519_PRIVATE_KEY_BASE64 is not set. Using a throwaway signing key for this dev session; passes will not verify after a restart.'
      );
    }
  } else {
    throw new Error(
      'ED25519_PRIVATE_KEY_BASE64 is not set. Refusing to sign passes without a configured key. Run "npm run keygen" to create one.'
    );
  }

  globalKeyStore.__pitstopEd25519Keypair = keypair;
  return keypair;
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
