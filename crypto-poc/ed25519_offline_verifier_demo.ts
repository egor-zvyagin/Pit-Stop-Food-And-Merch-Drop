/**
 * AGPC "Pit Stop" Platform: Offline Cryptographic Pass Verification Engine
 * Author: Egor Zvyagin | Project Manager & Cloud Architect (Capstone Team 28)
 * Context: Australian Grand Prix Corporation (Albert Park Circuit, Melbourne)
 *
 * Demonstrates:
 * 1. Ed25519 Asymmetric Keypair Generation (Master Cloud KMS simulation)
 * 2. Order Pass Creation & Canonical Deterministic Serialization
 * 3. Asymmetric Cryptographic Signing (Backend Private Key)
 * 4. Sub-10ms Offline Scanner Pass Verification (Terminal Public Key Only)
 * 5. Tamper & Forgery Detection (Cryptographic Payload Mutation Tests)
 * 6. High-Throughput Verification Latency Benchmark
 */

import * as crypto from 'crypto';

// --- DATA STRUCTURES & INTERFACES ---

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
}

export interface VerificationResult {
  isValid: boolean;
  orderId?: string;
  latencyMs: number;
  reason?: string;
  payload?: OrderPassPayload;
}

// --- CORE CRYPTOGRAPHIC MODULE ---

export class Ed25519PassEngine {
  /**
   * Generates a standard Ed25519 keypair.
   * In production, the private key is held exclusively in AWS KMS / HSM,
   * while public keys are cached on offline trackside scanner tablets.
   */
  public static generateKeypair(): { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } {
    return crypto.generateKeyPairSync('ed25519');
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
      items: payload.items.map(item => ({
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
   * Simulates the AWS Cloud Service: Signs an order pass with the master private key.
   */
  public static issueSignedPass(
    payload: OrderPassPayload,
    privateKey: crypto.KeyObject,
    keyId: string = 'AGPC-2027-KEY-01'
  ): SignedDigitalPass {
    const canonicalString = this.canonicalize(payload);
    const dataBuffer = Buffer.from(canonicalString, 'utf-8');

    // Sign using Ed25519 asymmetric algorithm (produces 64-byte signature)
    const signature = crypto.sign(null, dataBuffer, privateKey);

    return {
      payloadJson: canonicalString,
      signatureBase64: signature.toString('base64'),
      publicKeyId: keyId,
    };
  }

  /**
   * Simulates Trackside Offline Scanner: Verifies pass using ONLY the local public key.
   * Requires ZERO network connectivity or cloud API calls.
   */
  public static verifyPassOffline(
    pass: SignedDigitalPass,
    publicKey: crypto.KeyObject,
    currentStationId: string,
    currentEpochSeconds: number
  ): VerificationResult {
    const startTime = process.hrtime.bigint();

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

      // 4. Station Boundary Check (Optional circuit location restriction)
      if (parsed.targetStationId !== 'ALL' && parsed.targetStationId !== currentStationId) {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1_000_000;
        return {
          isValid: false,
          orderId: parsed.orderId,
          latencyMs,
          reason: `Station Mismatch: Pass restricted to ${parsed.targetStationId}, scanned at ${currentStationId}.`,
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
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        isValid: false,
        latencyMs,
        reason: `Malformed Payload Exception: ${errorMessage}`,
      };
    }
  }
}

// --- SELF-CONTAINED EXECUTION & VERIFICATION BENCHMARK ---

function runVerificationSuite(): void {
  console.log('================================================================');
  console.log('AGPC "Pit Stop" Ed25519 Offline Pass Verification Engine');
  console.log('Albert Park Circuit Trackside Triage Benchmark');
  console.log('================================================================\n');

  // Step 1: Provision Keys
  console.log('[1] Generating Ed25519 Master Cryptographic Keypair...');
  const { publicKey, privateKey } = Ed25519PassEngine.generateKeypair();
  console.log('    ✓ Public Key format: 32-byte Ed25519 raw point');
  console.log('    ✓ Private Key secured in local memory buffer\n');

  // Step 2: Assemble Sample F1 Spectator Order
  const currentEpoch = Math.floor(Date.now() / 1000);
  const sampleOrder: OrderPassPayload = {
    orderId: 'ORD-AGPC-2027-F1-08492',
    customerId: 'CUST-MEL-VIC-9821',
    targetStationId: 'STATION-TURN-1-CHICANE',
    issuedAt: currentEpoch,
    expiresAt: currentEpoch + 3600, // Valid for 1 hour
    items: [
      { sku: 'F1-CAP-MERC-2027', name: 'Mercedes-AMG Official Team Cap', quantity: 1, unitPriceCents: 8500 },
      { sku: 'F1-MEAL-BURGER-CP', name: 'Albert Park Angus Burger Combo', quantity: 2, unitPriceCents: 2400 },
    ],
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  // Step 3: Cloud Backend Signs Digital Pass
  console.log('[2] Cloud Backend: Signing pass with Ed25519 Private Key...');
  const signedPass = Ed25519PassEngine.issueSignedPass(sampleOrder, privateKey);
  console.log(`    ✓ Generated Signature (Base64): ${signedPass.signatureBase64.substring(0, 32)}...`);
  console.log(`    ✓ Total Pass Size: ${signedPass.payloadJson.length + signedPass.signatureBase64.length} bytes (Fits in low-density QR code)\n`);

  // Step 4: Trackside Concession Scanner Validates Pass Offline
  console.log('[3] Trackside Pod: Verifying pass OFFLINE (Airplane Mode Simulation)...');
  const result = Ed25519PassEngine.verifyPassOffline(
    signedPass,
    publicKey,
    'STATION-TURN-1-CHICANE',
    currentEpoch + 300 // Scanned 5 minutes after issue
  );

  console.log(`    ✓ Verification Status: ${result.isValid ? 'ACCEPTED' : 'REJECTED'}`);
  console.log(`    ✓ Verified Order ID:   ${result.orderId}`);
  console.log(`    ✓ Verification Time:   ${result.latencyMs.toFixed(3)} ms (Target: < 10.0 ms)\n`);

  // Step 5: Tamper Detection Test (Malicious Customer Modifies Quantity)
  console.log('[4] Security Test: Modifying order quantity from 1 to 9 (Tamper Test)...');
  const tamperedPayload = signedPass.payloadJson.replace('"quantity":1', '"quantity":9');
  const tamperedPass: SignedDigitalPass = {
    ...signedPass,
    payloadJson: tamperedPayload,
  };

  const tamperResult = Ed25519PassEngine.verifyPassOffline(
    tamperedPass,
    publicKey,
    'STATION-TURN-1-CHICANE',
    currentEpoch + 300
  );
  console.log(`    ✓ Tamper Detected:     ${!tamperResult.isValid ? 'YES (FORGERY BLOCKED)' : 'NO (SECURITY BREACH)'}`);
  console.log(`    ✓ Engine Reason:       "${tamperResult.reason}"\n`);

  // Step 6: 1,000 Iteration High-Throughput Latency Benchmark
  console.log('[5] Performance Benchmark: Executing 1,000 consecutive offline verifications...');
  const iterations = 1000;
  let totalLatency = 0;
  let maxLatency = 0;

  for (let i = 0; i < iterations; i++) {
    const benchResult = Ed25519PassEngine.verifyPassOffline(
      signedPass,
      publicKey,
      'STATION-TURN-1-CHICANE',
      currentEpoch + 300
    );
    totalLatency += benchResult.latencyMs;
    if (benchResult.latencyMs > maxLatency) {
      maxLatency = benchResult.latencyMs;
    }
  }

  const avgLatency = totalLatency / iterations;
  console.log(`    ✓ Total Passes Verified: ${iterations}`);
  console.log(`    ✓ Average Latency:        ${avgLatency.toFixed(3)} ms`);
  console.log(`    ✓ Peak Latency:           ${maxLatency.toFixed(3)} ms`);
  console.log(`    ✓ Concourse SLA Verdict:  ${avgLatency < 10.0 ? 'PASS (< 10 ms SLA MET)' : 'FAIL'}`);
  console.log('\n================================================================');
}

// Execute test suite when run directly
if (typeof require !== 'undefined' && require.main === module) {
  runVerificationSuite();
}
