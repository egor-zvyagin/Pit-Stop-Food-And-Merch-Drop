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
  qrPayload: string;       // Formatted string suitable for high-density QR scanning
}

export interface VerificationResult {
  isValid: boolean;
  orderId?: string;
  latencyMs: number;
  reason?: string;
  payload?: OrderPassPayload;
}

// In-memory keypair cache for runtime
let cachedKeypair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } | null = null;

export class Ed25519PassEngine {
  /**
   * Retrieves or initializes the Ed25519 keypair.
   * If base64 keys are configured in environment variables, they are loaded.
   * Otherwise, an asymmetric keypair is generated and cached in memory.
   */
  public static getKeypair(): { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } {
    if (cachedKeypair) {
      return cachedKeypair;
    }

    try {
      if (process.env.ED25519_PRIVATE_KEY_BASE64 && process.env.ED25519_PUBLIC_KEY_BASE64) {
        const privDer = Buffer.from(process.env.ED25519_PRIVATE_KEY_BASE64, 'base64');
        const pubDer = Buffer.from(process.env.ED25519_PUBLIC_KEY_BASE64, 'base64');

        const privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
        const publicKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });

        cachedKeypair = { publicKey, privateKey };
        return cachedKeypair;
      }
    } catch (e) {
      console.warn('Could not load Ed25519 keys from env, falling back to runtime generation:', e);
    }

    cachedKeypair = crypto.generateKeyPairSync('ed25519');
    return cachedKeypair;
  }

  /**
   * Produces a canonical, deterministic JSON representation of an order pass payload.
   * Eliminates key-ordering ambiguity that could invalidate signature hashing.
   */
  public static canonicalize(payload: OrderPassPayload): string {
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
   * Signs an order pass with the Ed25519 private key.
   */
  public static issueSignedPass(
    payload: OrderPassPayload,
    keyId: string = process.env.ED25519_KEY_ID || 'AGPC-2027-KEY-01'
  ): SignedDigitalPass {
    const { privateKey } = this.getKeypair();
    const canonicalString = this.canonicalize(payload);
    const dataBuffer = Buffer.from(canonicalString, 'utf-8');

    // Sign using Ed25519 asymmetric algorithm (produces 64-byte signature)
    const signature = crypto.sign(null, dataBuffer, privateKey);
    const signatureBase64 = signature.toString('base64');

    // High-density QR payload representation: Base64URL-encoded
    const encodedPayload = Buffer.from(canonicalString).toString('base64url');
    const encodedSig = signature.toString('base64url');
    const qrPayload = `AGPC1.${keyId}.${encodedPayload}.${encodedSig}`;

    return {
      payloadJson: canonicalString,
      signatureBase64,
      publicKeyId: keyId,
      qrPayload,
    };
  }

  /**
   * Verifies pass using ONLY the public key.
   * Runs in sub-10ms with zero network connectivity or cloud API calls.
   */
  public static verifyPassOffline(
    pass: { payloadJson: string; signatureBase64: string },
    currentStationId: string = 'ALL',
    currentEpochSeconds: number = Math.floor(Date.now() / 1000)
  ): VerificationResult {
    const startTime = process.hrtime.bigint();
    const { publicKey } = this.getKeypair();

    try {
      const dataBuffer = Buffer.from(pass.payloadJson, 'utf-8');
      const signatureBuffer = Buffer.from(pass.signatureBase64, 'base64');

      // 1. Cryptographic Signature Verification
      const isSignatureValid = crypto.verify(null, dataBuffer, publicKey, signatureBuffer);
      if (!isSignatureValid) {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1_000_000;
        return {
          isValid: false,
          latencyMs,
          reason: 'Cryptographic Signature Invalid: Payload was altered or signature forged.',
        };
      }

      // 2. Parse Canonical Payload
      const parsed: OrderPassPayload = JSON.parse(pass.payloadJson);

      // 3. Expiration Check
      if (currentEpochSeconds > parsed.expiresAt) {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1_000_000;
        return {
          isValid: false,
          orderId: parsed.orderId,
          latencyMs,
          reason: `Pass Expired: Expired at ${parsed.expiresAt}, current time is ${currentEpochSeconds}.`,
        };
      }

      // 4. Station Boundary Check
      if (currentStationId !== 'ALL' && parsed.targetStationId !== 'ALL' && parsed.targetStationId !== currentStationId) {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1_000_000;
        return {
          isValid: false,
          orderId: parsed.orderId,
          latencyMs,
          reason: `Incorrect Concession Pod: Assigned to ${parsed.targetStationId}, scanned at ${currentStationId}.`,
        };
      }

      const endTime = process.hrtime.bigint();
      const latencyMs = Number(endTime - startTime) / 1_000_000;

      return {
        isValid: true,
        orderId: parsed.orderId,
        latencyMs,
        payload: parsed,
      };
    } catch (err: unknown) {
      const endTime = process.hrtime.bigint();
      const latencyMs = Number(endTime - startTime) / 1_000_000;
      const errorMsg = err instanceof Error ? err.message : 'Unknown validation failure';
      return {
        isValid: false,
        latencyMs,
        reason: `Verification Exception: ${errorMsg}`,
      };
    }
  }

  /**
   * Helper to parse and verify a raw QR payload string.
   */
  public static verifyQrPayload(
    qrString: string,
    currentStationId: string = 'ALL'
  ): VerificationResult {
    try {
      const parts = qrString.split('.');
      if (parts.length === 4 && parts[0] === 'AGPC1') {
        const payloadJson = Buffer.from(parts[2], 'base64url').toString('utf-8');
        const signatureBase64 = Buffer.from(parts[3], 'base64url').toString('base64');
        return this.verifyPassOffline({ payloadJson, signatureBase64 }, currentStationId);
      }
      return {
        isValid: false,
        latencyMs: 0,
        reason: 'Malformed QR payload scheme',
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Invalid QR format';
      return {
        isValid: false,
        latencyMs: 0,
        reason: `QR Parse Error: ${errorMsg}`,
      };
    }
  }
}
